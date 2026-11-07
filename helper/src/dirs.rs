//! Folder browsing for choosing the notes folder: lists subfolder names only,
//! never file contents, and creates new folders.

use std::cmp::Ordering;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::protocol::{ErrorCode, ProtocolError};

/// The user's home folder from the environment.
pub fn home_dir() -> Option<PathBuf> {
    let name = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// Top-level locations: every existing drive on Windows, `/` elsewhere.
fn roots() -> Vec<String> {
    if cfg!(windows) {
        (b'A'..=b'Z')
            .map(|letter| format!("{}:\\", letter as char))
            .filter(|drive| Path::new(drive).is_dir())
            .collect()
    } else {
        vec!["/".to_string()]
    }
}

/// True for folders that are hidden or system-owned and never offered as notes folders.
fn is_hidden(name: &str) -> bool {
    name.starts_with('.') || name.starts_with('$') || name == "System Volume Information"
}

/// Require an absolute path argument.
fn absolute(path: &str) -> Result<PathBuf, ProtocolError> {
    let path = PathBuf::from(path);
    if path.is_absolute() {
        Ok(path)
    } else {
        Err(ProtocolError::new(
            ErrorCode::BadRequest,
            format!("{} is not a full folder path.", path.display()),
        ))
    }
}

/// List the visible subfolders of a folder, sorted by name, with Git repositories marked.
pub fn list_dirs(path: &str) -> Result<Value, ProtocolError> {
    let path = absolute(path)?;
    let reader = fs::read_dir(&path).map_err(|error| match error.kind() {
        ErrorKind::NotFound => ProtocolError::new(
            ErrorCode::NotFound,
            format!("{} does not exist.", path.display()),
        ),
        _ => ProtocolError::new(
            ErrorCode::Io,
            format!("Cannot open {}: {error}", path.display()),
        ),
    })?;

    let mut entries: Vec<(String, PathBuf, bool)> = reader
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            if is_hidden(&name) {
                return None;
            }
            let full = entry.path();
            let is_repo = full.join(".git").exists();
            Some((name, full, is_repo))
        })
        .collect();
    entries.sort_by(|(a, _, _), (b, _, _)| compare_names(a, b));

    Ok(json!({
        "path": path.to_string_lossy(),
        "parent": path.parent().map(|parent| parent.to_string_lossy()),
        "home": home_dir().map(|home| home.to_string_lossy().into_owned()),
        "roots": roots(),
        "entries": entries
            .into_iter()
            .map(|(name, full, is_repo)| {
                json!({ "name": name, "path": full.to_string_lossy(), "isRepo": is_repo })
            })
            .collect::<Vec<_>>(),
    }))
}

/// Case-insensitive name order with a stable tie-break.
pub fn compare_names(a: &str, b: &str) -> Ordering {
    a.to_lowercase().cmp(&b.to_lowercase()).then_with(|| a.cmp(b))
}

/// Check a new folder name for characters that are invalid on any supported OS.
pub fn validate_folder_name(name: &str) -> Result<(), ProtocolError> {
    let invalid = name.is_empty()
        || name != name.trim()
        || name == "."
        || name == ".."
        || name.ends_with('.')
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c));
    if invalid {
        Err(ProtocolError::new(
            ErrorCode::BadRequest,
            format!(
                "\"{name}\" is not a valid folder name. Avoid < > : \" / \\ | ? * and a trailing dot or space."
            ),
        ))
    } else {
        Ok(())
    }
}

/// Create one new folder inside an existing folder and return its path.
pub fn create_dir(parent: &str, name: &str) -> Result<Value, ProtocolError> {
    let parent = absolute(parent)?;
    validate_folder_name(name)?;
    let path = parent.join(name);
    fs::create_dir(&path).map_err(|error| match error.kind() {
        ErrorKind::AlreadyExists => ProtocolError::new(
            ErrorCode::Io,
            format!("A folder named \"{name}\" already exists here."),
        ),
        ErrorKind::NotFound => ProtocolError::new(
            ErrorCode::NotFound,
            format!("{} does not exist.", parent.display()),
        ),
        _ => ProtocolError::new(
            ErrorCode::Io,
            format!("Cannot create \"{name}\": {error}"),
        ),
    })?;
    Ok(json!({ "path": path.to_string_lossy() }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    #[test]
    fn lists_visible_folders_sorted_with_repos_marked() {
        let dir = TestDir::new("dirs");
        for name in ["beta", "Alpha", ".hidden", "repo"] {
            fs::create_dir(dir.path().join(name)).unwrap();
        }
        fs::create_dir(dir.path().join("repo").join(".git")).unwrap();
        fs::write(dir.path().join("file.md"), "# not a folder").unwrap();

        let listing = list_dirs(&dir.path().to_string_lossy()).unwrap();
        let names: Vec<&str> = listing["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, vec!["Alpha", "beta", "repo"]);
        assert_eq!(listing["entries"][2]["isRepo"], json!(true));
        assert_eq!(listing["entries"][0]["isRepo"], json!(false));
        assert!(listing["parent"].is_string());
        assert!(!listing["roots"].as_array().unwrap().is_empty());
    }

    #[test]
    fn relative_and_missing_paths_are_errors() {
        assert_eq!(
            list_dirs("relative/path").unwrap_err().code,
            ErrorCode::BadRequest
        );
        let dir = TestDir::new("dirs-missing");
        let missing = dir.path().join("nope");
        assert_eq!(
            list_dirs(&missing.to_string_lossy()).unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn creates_a_folder_once() {
        let dir = TestDir::new("dirs-create");
        let parent = dir.path().to_string_lossy().into_owned();
        let created = create_dir(&parent, "My Notes").unwrap();
        assert!(dir.path().join("My Notes").is_dir());
        assert_eq!(
            created["path"],
            json!(dir.path().join("My Notes").to_string_lossy())
        );
        assert_eq!(
            create_dir(&parent, "My Notes").unwrap_err().code,
            ErrorCode::Io
        );
    }

    #[test]
    fn rejects_unsafe_folder_names() {
        for name in ["", " x", "x ", ".", "..", "a/b", "a\\b", "a:b", "end.", "tab\t"] {
            assert!(validate_folder_name(name).is_err(), "{name:?}");
        }
        assert!(validate_folder_name("Trip to Japan").is_ok());
    }
}
