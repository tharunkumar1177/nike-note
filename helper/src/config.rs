//! Per-user helper settings: remembers the chosen notes folder so the browser
//! never asks for folder access again (see architecture.md, Notes folder and path safety).

use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::install::{TargetOs, path_var, xdg_var};

/// Location of the settings file for an OS, or None when the environment gives no base folder.
pub fn config_file(os: TargetOs, var: impl Fn(&str) -> Option<OsString>) -> Option<PathBuf> {
    match os {
        TargetOs::Windows => {
            path_var(&var, "LOCALAPPDATA").map(|base| base.join("Quire").join("config.json"))
        }
        TargetOs::MacOs => path_var(&var, "HOME").map(|home| {
            home.join("Library")
                .join("Application Support")
                .join("Quire")
                .join("config.json")
        }),
        TargetOs::Linux => xdg_var(&var, "XDG_CONFIG_HOME")
            .or_else(|| path_var(&var, "HOME").map(|home| home.join(".config")))
            .map(|base| base.join("quire").join("config.json")),
    }
}

/// Read the remembered notes folder. A missing or unreadable file means none.
pub fn read_root(file: &Path) -> Option<PathBuf> {
    let text = fs::read_to_string(file).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value
        .get("notesRoot")
        .and_then(Value::as_str)
        .filter(|root| !root.is_empty())
        .map(PathBuf::from)
}

/// Remember the notes folder, replacing the file atomically.
pub fn write_root(file: &Path, root: &Path) -> io::Result<()> {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(&json!({ "notesRoot": root.to_string_lossy() }))
        .map_err(io::Error::other)?;
    let staging = file.with_extension("json.new");
    fs::write(&staging, format!("{text}\n"))?;
    fs::rename(&staging, file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    /// Build an environment lookup from fixed pairs.
    fn env(pairs: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<OsString> {
        move |name| {
            pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| OsString::from(value))
        }
    }

    #[test]
    fn config_file_follows_each_os_layout() {
        assert_eq!(
            config_file(TargetOs::Windows, env(&[("LOCALAPPDATA", r"C:\L")])),
            Some(PathBuf::from(r"C:\L").join("Quire").join("config.json"))
        );
        assert_eq!(
            config_file(TargetOs::MacOs, env(&[("HOME", "/Users/ana")])),
            Some(PathBuf::from(
                "/Users/ana/Library/Application Support/Quire/config.json"
            ))
        );
        assert_eq!(
            config_file(TargetOs::Linux, env(&[("HOME", "/home/ana")])),
            Some(PathBuf::from("/home/ana/.config/quire/config.json"))
        );
        assert_eq!(
            config_file(
                TargetOs::Linux,
                env(&[("HOME", "/home/ana"), ("XDG_CONFIG_HOME", "/cfg")])
            ),
            Some(PathBuf::from("/cfg/quire/config.json"))
        );
        assert_eq!(config_file(TargetOs::Linux, env(&[])), None);
    }

    #[test]
    fn root_round_trips_through_the_file() {
        let dir = TestDir::new("config");
        let file = dir.path().join("nested").join("config.json");
        assert_eq!(read_root(&file), None);
        write_root(&file, Path::new("/notes/My Notes")).unwrap();
        assert_eq!(read_root(&file), Some(PathBuf::from("/notes/My Notes")));
    }

    #[test]
    fn corrupt_files_mean_no_root() {
        let dir = TestDir::new("config-corrupt");
        let file = dir.path().join("config.json");
        fs::write(&file, "{not json").unwrap();
        assert_eq!(read_root(&file), None);
        fs::write(&file, r#"{"notesRoot": ""}"#).unwrap();
        assert_eq!(read_root(&file), None);
    }
}
