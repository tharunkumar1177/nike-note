//! Page operations that change the folder structure (see architecture.md,
//! Page structure): creating a sub-page as a new folder with a `README.md`.

use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use serde_json::{Value, json};

use crate::dirs::validate_folder_name;
use crate::paths::page_dir;
use crate::protocol::{ErrorCode, ProtocolError};

/// Longest folder name made from a title, in characters.
const MAX_NAME_CHARS: usize = 60;
/// Title and folder name used when a title has no usable characters.
const UNTITLED: &str = "Untitled";
/// Characters that are invalid in a folder name on at least one supported OS.
const INVALID: &str = "<>:\"/\\|?*";
/// Device names Windows reserves, refused as folder names on every OS so notes
/// folders stay portable.
const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// A one-line page title: control characters become spaces and the ends are trimmed.
fn clean_title(title: &str) -> String {
    let flat: String = title
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let trimmed = flat.trim();
    if trimmed.is_empty() {
        UNTITLED.to_string()
    } else {
        trimmed.to_string()
    }
}

/// A folder name for a page titled `title`. Characters that are invalid on
/// some OS become spaces, runs of spaces collapse, leading dots and trailing
/// dots or spaces are dropped, and the name is at most 60 characters. Reserved
/// names and `assets` get " page" added.
fn folder_name(title: &str) -> String {
    let replaced: String = title
        .chars()
        .map(|c| {
            if c.is_control() || INVALID.contains(c) {
                ' '
            } else {
                c
            }
        })
        .collect();
    let collapsed = replaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let short: String = collapsed.chars().take(MAX_NAME_CHARS).collect();
    let name = short
        .trim_start_matches(['.', ' '])
        .trim_end_matches(['.', ' ']);
    if name.is_empty() {
        return UNTITLED.to_string();
    }
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    if RESERVED.contains(&stem.as_str()) || name.eq_ignore_ascii_case("assets") {
        return format!("{name} page");
    }
    name.to_string()
}

/// An IO error while creating a page.
fn io_error(error: std::io::Error) -> ProtocolError {
    ProtocolError::new(ErrorCode::Io, format!("Cannot create the page: {error}"))
}

/// `base`, or `base 2`, `base 3`, and so on: the first name no entry in `dir`
/// uses, compared without case so it works on case-insensitive disks.
fn unique_name(dir: &Path, base: &str) -> Result<String, ProtocolError> {
    let taken: HashSet<String> = fs::read_dir(dir)
        .map_err(io_error)?
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().to_lowercase())
        .collect();
    std::iter::once(base.to_string())
        .chain((2..10_000).map(|n| format!("{base} {n}")))
        .find(|name| !taken.contains(&name.to_lowercase()))
        .ok_or_else(|| ProtocolError::new(ErrorCode::Io, "Too many pages share this name."))
}

/// Create a sub-page of `parent` titled `title`: a new folder named after the
/// title and a `README.md` whose first line is `# <title>`. Returns the new
/// page path, its folder name, and the title used.
pub fn create_page(root: &Path, parent: &str, title: &str) -> Result<Value, ProtocolError> {
    let resolved = page_dir(root, parent)?;
    let title = clean_title(title);
    let name = unique_name(&resolved.dir, &folder_name(&title))?;
    validate_folder_name(&name)?;
    let folder = resolved.dir.join(&name);
    fs::create_dir(&folder).map_err(|error| match error.kind() {
        ErrorKind::AlreadyExists => ProtocolError::new(
            ErrorCode::Io,
            format!("A folder named \"{name}\" appeared while the page was created."),
        ),
        _ => io_error(error),
    })?;
    if let Err(error) = fs::write(folder.join("README.md"), format!("# {title}\n")) {
        let _ = fs::remove_dir(&folder);
        return Err(io_error(error));
    }
    let path = if parent.is_empty() {
        name.clone()
    } else {
        format!("{parent}/{name}")
    };
    Ok(json!({ "path": path, "folder": name, "title": title }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    #[test]
    fn makes_portable_folder_names_from_titles() {
        assert_eq!(folder_name("Trip to Japan"), "Trip to Japan");
        assert_eq!(folder_name("Q1/Q2: plans?"), "Q1 Q2 plans");
        assert_eq!(folder_name("  ..hidden.  "), "hidden");
        assert_eq!(folder_name("con"), "con page");
        assert_eq!(folder_name("LPT1.txt"), "LPT1.txt page");
        assert_eq!(folder_name("Assets"), "Assets page");
        assert_eq!(folder_name("???"), "Untitled");
        assert_eq!(folder_name(&"é".repeat(80)).chars().count(), 60);
        assert_eq!(clean_title(" Two\nlines "), "Two lines");
        assert_eq!(clean_title("\t"), "Untitled");
    }

    #[test]
    fn creates_a_folder_with_a_titled_readme_and_a_unique_name() {
        let dir = TestDir::new("pageops-create");
        let trips = dir.path().join("Trips");
        fs::create_dir(&trips).unwrap();
        fs::create_dir(trips.join("untitled")).unwrap();

        let first = create_page(dir.path(), "Trips", "Untitled").unwrap();
        assert_eq!(first["path"], json!("Trips/Untitled 2"));
        assert_eq!(first["folder"], json!("Untitled 2"));
        let readme = trips.join("Untitled 2").join("README.md");
        assert_eq!(fs::read_to_string(readme).unwrap(), "# Untitled\n");

        let top = create_page(dir.path(), "", "Ideas: 2027").unwrap();
        assert_eq!(top["path"], json!("Ideas 2027"));
        assert_eq!(top["title"], json!("Ideas: 2027"));
    }

    #[test]
    fn refuses_parents_outside_the_notes_folder() {
        let dir = TestDir::new("pageops-outside");
        let error = create_page(dir.path(), "../elsewhere", "Page").unwrap_err();
        assert_eq!(error.code, ErrorCode::OutsideRoot);
        let missing = create_page(dir.path(), "Missing", "Page").unwrap_err();
        assert_eq!(missing.code, ErrorCode::NotFound);
    }
}
