//! Runs the user's `git` for the notes folder (see architecture.md, Git sync).
//! The helper never stores credentials; Git uses the user's own setup.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::process::{Command, Output, Stdio};

use serde_json::{Value, json};

use crate::protocol::{ErrorCode, ProtocolError};

/// Message used for the commit created by the first push.
pub const INITIAL_COMMIT_MESSAGE: &str = "Quire: initial commit";

/// Build a `git` command that never opens a console window or a terminal prompt.
fn git_command(dir: &Path) -> Command {
    let mut command = Command::new("git");
    command
        .current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Run git and capture its output.
fn run(dir: &Path, args: &[&str]) -> Result<Output, ProtocolError> {
    git_command(dir)
        .args(args)
        .output()
        .map_err(|error| match error.kind() {
            ErrorKind::NotFound => ProtocolError::new(
                ErrorCode::Git,
                "Git is not installed, or it is not on the PATH.",
            ),
            _ => ProtocolError::new(ErrorCode::Git, format!("Cannot run git: {error}")),
        })
}

/// Run git and return trimmed standard output, or a `GIT` error with its message.
fn run_ok(dir: &Path, args: &[&str]) -> Result<String, ProtocolError> {
    let output = run(dir, args)?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let detail = if stderr.is_empty() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        stderr
    };
    Err(ProtocolError::new(
        ErrorCode::Git,
        format!("git {} failed: {detail}", args.first().unwrap_or(&"")),
    ))
}

/// Run a read-only git query; any failure means "no value".
fn query(dir: &Path, args: &[&str]) -> Option<String> {
    run_ok(dir, args).ok().filter(|value| !value.is_empty())
}

/// Installed git version, or None when git cannot run.
pub fn version(dir: &Path) -> Option<String> {
    query(dir, &["--version"]).map(|text| {
        text.strip_prefix("git version ")
            .unwrap_or(&text)
            .to_string()
    })
}

/// True when the folder itself is the top level of a Git work tree.
fn is_repo_root(root: &Path) -> bool {
    let Some(top) = query(root, &["rev-parse", "--show-toplevel"]) else {
        return false;
    };
    match (fs::canonicalize(top), fs::canonicalize(root)) {
        (Ok(top), Ok(root)) => top == root,
        _ => false,
    }
}

/// Git state of the notes folder as shown by the setup screen and the status bar.
pub fn status(root: &Path) -> Value {
    let Some(version) = version(root) else {
        return json!({ "available": false });
    };
    if !is_repo_root(root) {
        return json!({ "available": true, "version": version, "isRepo": false });
    }
    let name = query(root, &["config", "user.name"]);
    let email = query(root, &["config", "user.email"]);
    let identity = match (name, email) {
        (Some(name), Some(email)) => json!({ "name": name, "email": email }),
        _ => Value::Null,
    };
    json!({
        "available": true,
        "version": version,
        "isRepo": true,
        "branch": query(root, &["symbolic-ref", "--short", "-q", "HEAD"]),
        "hasCommits": query(root, &["rev-parse", "--verify", "-q", "HEAD"]).is_some(),
        "origin": query(root, &["remote", "get-url", "origin"]),
        "upstream": query(root, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
        "identity": identity,
    })
}

/// Reject values git could read as an option or that span lines.
fn plain_value(label: &str, value: &str) -> Result<String, ProtocolError> {
    let value = value.trim();
    if value.is_empty() || value.starts_with('-') || value.chars().any(char::is_control) {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            format!("Enter a valid {label}."),
        ));
    }
    Ok(value.to_string())
}

/// Make the folder a repository, on `main` unless the user configured another default.
pub fn init(root: &Path) -> Result<(), ProtocolError> {
    if is_repo_root(root) {
        return Ok(());
    }
    if query(root, &["config", "--get", "init.defaultBranch"]).is_some() {
        run_ok(root, &["init"])?;
    } else {
        run_ok(root, &["init", "--initial-branch=main"])?;
    }
    Ok(())
}

/// Save the commit author for this repository only.
pub fn set_identity(root: &Path, name: &str, email: &str) -> Result<(), ProtocolError> {
    let name = plain_value("name", name)?;
    let email = plain_value("email address", email)?;
    if !email.contains('@') || email.contains(char::is_whitespace) {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            "Enter a valid email address.",
        ));
    }
    require_repo(root)?;
    run_ok(root, &["config", "--local", "user.name", &name])?;
    run_ok(root, &["config", "--local", "user.email", &email])?;
    Ok(())
}

/// Add or replace the `origin` remote.
pub fn set_origin(root: &Path, url: &str) -> Result<(), ProtocolError> {
    let url = plain_value("remote URL", url)?;
    if url.contains(char::is_whitespace) {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            "A remote URL cannot contain spaces.",
        ));
    }
    require_repo(root)?;
    if query(root, &["remote", "get-url", "origin"]).is_some() {
        run_ok(root, &["remote", "set-url", "origin", &url])?;
    } else {
        run_ok(root, &["remote", "add", "origin", &url])?;
    }
    Ok(())
}

/// First push: commit the folder when the repository has no commits, then push
/// the current branch to `origin` and track it.
pub fn publish(root: &Path) -> Result<(), ProtocolError> {
    require_repo(root)?;
    if query(root, &["remote", "get-url", "origin"]).is_none() {
        return Err(ProtocolError::new(
            ErrorCode::Git,
            "Add a remote named origin before pushing.",
        ));
    }
    if query(root, &["rev-parse", "--verify", "-q", "HEAD"]).is_none() {
        let readme = root.join("README.md");
        if !readme.exists() {
            let title = root
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| "Home".to_string());
            fs::write(&readme, format!("# {title}\n")).map_err(|error| {
                ProtocolError::new(ErrorCode::Io, format!("Cannot create README.md: {error}"))
            })?;
        }
        run_ok(root, &["add", "--all"])?;
        run_ok(root, &["commit", "--message", INITIAL_COMMIT_MESSAGE])?;
    }
    run_ok(root, &["push", "--set-upstream", "origin", "HEAD"])?;
    Ok(())
}

/// Fail with a clear message when the folder is not a repository root.
fn require_repo(root: &Path) -> Result<(), ProtocolError> {
    if is_repo_root(root) {
        Ok(())
    } else {
        Err(ProtocolError::new(
            ErrorCode::Git,
            "This folder is not a Git repository yet.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    #[test]
    fn reports_a_plain_folder_as_not_a_repo() {
        let dir = TestDir::new("git-plain");
        let state = status(dir.path());
        assert_eq!(state["available"], json!(true));
        assert_eq!(state["isRepo"], json!(false));
    }

    #[test]
    fn full_setup_reaches_a_tracked_branch() {
        let dir = TestDir::new("git-setup");
        let notes = dir.path().join("Trip Notes");
        let remote = dir.path().join("remote.git");
        fs::create_dir(&notes).unwrap();
        fs::create_dir(&remote).unwrap();
        run_ok(&remote, &["init", "--bare"]).unwrap();

        init(&notes).unwrap();
        let state = status(&notes);
        assert_eq!(state["isRepo"], json!(true));
        assert_eq!(state["hasCommits"], json!(false));
        assert_eq!(state["origin"], Value::Null);

        set_identity(&notes, "Ana Writer", "ana@example.com").unwrap();
        assert_eq!(
            status(&notes)["identity"],
            json!({ "name": "Ana Writer", "email": "ana@example.com" })
        );

        assert_eq!(publish(&notes).unwrap_err().code, ErrorCode::Git);
        set_origin(&notes, &remote.to_string_lossy()).unwrap();
        publish(&notes).unwrap();

        let state = status(&notes);
        assert_eq!(state["hasCommits"], json!(true));
        let branch = state["branch"].as_str().unwrap().to_string();
        assert_eq!(state["upstream"], json!(format!("origin/{branch}")));
        assert_eq!(
            fs::read_to_string(notes.join("README.md")).unwrap(),
            "# Trip Notes\n"
        );
        let pushed = run_ok(&remote, &["log", "--format=%s", &branch]).unwrap();
        assert_eq!(pushed, INITIAL_COMMIT_MESSAGE);
    }

    #[test]
    fn a_subfolder_of_a_repo_is_not_a_repo_root() {
        let dir = TestDir::new("git-sub");
        init(dir.path()).unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        assert_eq!(status(&sub)["isRepo"], json!(false));
    }

    #[test]
    fn rejects_option_like_and_multiline_values() {
        let dir = TestDir::new("git-values");
        init(dir.path()).unwrap();
        assert!(set_origin(dir.path(), "--upload-pack=evil").is_err());
        assert!(set_origin(dir.path(), "https://a b").is_err());
        assert!(set_identity(dir.path(), "-n", "a@b.c").is_err());
        assert!(set_identity(dir.path(), "Ana", "not-an-email").is_err());
        assert!(set_identity(dir.path(), "Ana\nEvil", "a@b.c").is_err());
    }
}
