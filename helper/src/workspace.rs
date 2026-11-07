//! The chosen notes folder and its combined folder and Git state.

use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::config;
use crate::git;
use crate::protocol::{ErrorCode, ProtocolError};

/// Holds the notes folder for one helper session.
#[derive(Debug, Default)]
pub struct Workspace {
    root: Option<PathBuf>,
    config_file: Option<PathBuf>,
}

impl Workspace {
    /// Load the remembered notes folder from the settings file, if any.
    pub fn load(config_file: Option<PathBuf>) -> Self {
        let root = config_file.as_deref().and_then(config::read_root);
        Self { root, config_file }
    }

    /// The notes folder, or `NOT_FOUND` when none is chosen or it no longer exists.
    pub fn root(&self) -> Result<PathBuf, ProtocolError> {
        match &self.root {
            Some(root) if root.is_dir() => Ok(root.clone()),
            Some(root) => Err(ProtocolError::new(
                ErrorCode::NotFound,
                format!("The notes folder {} no longer exists.", root.display()),
            )),
            None => Err(ProtocolError::new(
                ErrorCode::NotFound,
                "No notes folder is chosen yet.",
            )),
        }
    }

    /// Current state for the app.
    pub fn status(&self) -> Value {
        status_for(self.root.as_deref())
    }

    /// Choose and remember a new notes folder.
    pub fn set_root(&mut self, path: &str) -> Result<Value, ProtocolError> {
        let root = PathBuf::from(path);
        if !root.is_absolute() {
            return Err(ProtocolError::new(
                ErrorCode::BadRequest,
                format!("{path} is not a full folder path."),
            ));
        }
        if !root.is_dir() {
            return Err(ProtocolError::new(
                ErrorCode::NotFound,
                format!("{path} is not an existing folder."),
            ));
        }
        if let Some(file) = &self.config_file {
            config::write_root(file, &root).map_err(|error| {
                ProtocolError::new(
                    ErrorCode::Io,
                    format!("Cannot save the notes folder setting: {error}"),
                )
            })?;
        }
        self.root = Some(root);
        Ok(self.status())
    }
}

/// Folder and Git state for an optional notes folder.
pub fn status_for(root: Option<&Path>) -> Value {
    let Some(root) = root else {
        return json!({ "root": null, "rootName": null, "rootError": null, "git": null });
    };
    let name = root
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.to_string_lossy().into_owned());
    if !root.is_dir() {
        return json!({
            "root": root.to_string_lossy(),
            "rootName": name,
            "rootError": format!("The notes folder {} no longer exists.", root.display()),
            "git": null,
        });
    }
    json!({
        "root": root.to_string_lossy(),
        "rootName": name,
        "rootError": null,
        "git": git::status(root),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    #[test]
    fn starts_empty_without_settings() {
        let workspace = Workspace::load(None);
        assert_eq!(workspace.status()["root"], Value::Null);
        assert_eq!(workspace.root().unwrap_err().code, ErrorCode::NotFound);
    }

    #[test]
    fn remembers_the_chosen_folder() {
        let dir = TestDir::new("workspace");
        let notes = dir.path().join("notes");
        std::fs::create_dir(&notes).unwrap();
        let settings = dir.path().join("config.json");

        let mut workspace = Workspace::load(Some(settings.clone()));
        let status = workspace.set_root(&notes.to_string_lossy()).unwrap();
        assert_eq!(status["rootName"], json!("notes"));
        assert_eq!(status["git"]["isRepo"], json!(false));

        let reloaded = Workspace::load(Some(settings));
        assert_eq!(reloaded.root().unwrap(), notes);
    }

    #[test]
    fn rejects_relative_and_missing_folders() {
        let dir = TestDir::new("workspace-bad");
        let mut workspace = Workspace::load(None);
        assert_eq!(
            workspace.set_root("notes").unwrap_err().code,
            ErrorCode::BadRequest
        );
        let missing = dir.path().join("missing");
        assert_eq!(
            workspace
                .set_root(&missing.to_string_lossy())
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn reports_a_vanished_folder() {
        let status = status_for(Some(Path::new("/definitely/not/here/quire")));
        assert!(status["rootError"].is_string());
        assert_eq!(status["git"], Value::Null);
    }
}
