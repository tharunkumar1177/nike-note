//! Auto-sync for the notes folder (see architecture.md, Git sync): commit local
//! changes, fetch, take remote changes only when they apply without conflict,
//! and push. Local work is never discarded.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde_json::{Value, json};

use crate::git::{detail, query, require_repo, run, run_ok};
use crate::protocol::{ErrorCode, ProtocolError};

/// How many times one sync fetches again after the remote moved during a push.
const PUSH_ATTEMPTS: usize = 3;

/// Result of one sync as the app sees it.
#[derive(Debug, PartialEq, Eq)]
enum State {
    /// Local and remote branches are equal.
    Synced,
    /// The remote could not be reached; local commits wait for the next sync.
    Offline,
    /// Local and remote changes touch the same lines, or Git is busy with
    /// another operation; nothing was rebased.
    Conflict,
}

impl State {
    /// Wire name of the state.
    fn as_str(&self) -> &'static str {
        match self {
            State::Synced => "synced",
            State::Offline => "offline",
            State::Conflict => "conflict",
        }
    }
}

/// The remote branch the current branch tracks.
struct Upstream {
    remote: String,
    merge: String,
}

/// Running totals for one sync.
#[derive(Default)]
struct Done {
    committed: usize,
    pulled: bool,
}

/// Take a lock, keeping going after a panic on another thread.
fn lock(writes: &Mutex<()>) -> MutexGuard<'_, ()> {
    writes.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Commit message for a commit touching `pages` pages.
fn commit_message(pages: usize) -> String {
    match pages {
        0 => "Quire: update notes".to_string(),
        1 => "Quire: update 1 page".to_string(),
        n => format!("Quire: update {n} pages"),
    }
}

/// Distinct pages touched by changed file paths (relative, `/`-separated).
/// Files under dot folders are not pages; files under `assets` belong to the
/// page that holds the `assets` folder; other files belong to their folder.
fn changed_pages<'a>(paths: impl IntoIterator<Item = &'a str>) -> BTreeSet<String> {
    let mut pages = BTreeSet::new();
    for path in paths {
        let parts: Vec<&str> = path.split('/').filter(|part| !part.is_empty()).collect();
        if parts.is_empty() || parts.iter().any(|part| part.starts_with('.')) {
            continue;
        }
        let end = parts
            .iter()
            .position(|part| *part == "assets")
            .unwrap_or(parts.len() - 1);
        pages.insert(parts[..end].join("/"));
    }
    pages
}

/// Stage everything and commit it. Returns the number of pages committed.
fn commit_changes(root: &Path) -> Result<usize, ProtocolError> {
    run_ok(root, &["add", "--all"])?;
    let names = run_ok(
        root,
        &["diff", "--cached", "--name-only", "--no-renames", "-z"],
    )?;
    if names.is_empty() {
        return Ok(0);
    }
    let pages = changed_pages(names.split('\0')).len();
    let message = commit_message(pages);
    run_ok(root, &["commit", "--quiet", "--message", &message])?;
    Ok(pages.max(1))
}

/// Absolute path of the repository's Git folder.
fn git_dir(root: &Path) -> Result<PathBuf, ProtocolError> {
    run_ok(root, &["rev-parse", "--absolute-git-dir"]).map(PathBuf::from)
}

/// Name of a rebase, merge, or similar operation left unfinished in the repository.
fn operation_in_progress(git_dir: &Path) -> Option<&'static str> {
    [
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
        ("MERGE_HEAD", "merge"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
    ]
    .into_iter()
    .find(|(entry, _)| git_dir.join(entry).exists())
    .map(|(_, name)| name)
}

/// Error for a branch that does not track a remote branch.
fn no_upstream() -> ProtocolError {
    ProtocolError::new(
        ErrorCode::Git,
        "This branch does not track a remote branch. Push it once to set one.",
    )
}

/// The remote and branch the current branch tracks.
fn upstream(root: &Path) -> Result<Upstream, ProtocolError> {
    let branch = query(root, &["symbolic-ref", "--short", "-q", "HEAD"]);
    let branch = branch.ok_or_else(no_upstream)?;
    let remote_key = format!("branch.{branch}.remote");
    let merge_key = format!("branch.{branch}.merge");
    let remote = query(root, &["config", "--get", &remote_key]);
    let merge = query(root, &["config", "--get", &merge_key]);
    match (remote, merge) {
        (Some(remote), Some(merge)) if !remote.starts_with('-') => Ok(Upstream { remote, merge }),
        _ => Err(no_upstream()),
    }
}

/// Commits on the local branch the remote lacks, and the other way round.
fn ahead_behind(root: &Path) -> Result<(u64, u64), ProtocolError> {
    let counts = run_ok(
        root,
        &["rev-list", "--left-right", "--count", "HEAD...@{u}"],
    )?;
    let mut numbers = counts.split_whitespace().map(str::parse::<u64>);
    match (numbers.next(), numbers.next()) {
        (Some(Ok(ahead)), Some(Ok(behind))) => Ok((ahead, behind)),
        _ => Err(ProtocolError::new(
            ErrorCode::Git,
            format!("Unexpected output from git rev-list: {counts}"),
        )),
    }
}

/// Build the sync result sent to the app.
fn outcome(
    root: &Path,
    state: State,
    done: &Done,
    files: Vec<String>,
    message: Option<String>,
) -> Result<Value, ProtocolError> {
    let (ahead, behind) = ahead_behind(root).unwrap_or((0, 0));
    Ok(json!({
        "state": state.as_str(),
        "ahead": ahead,
        "behind": behind,
        "committed": done.committed,
        "pulled": done.pulled,
        "files": files,
        "message": message,
    }))
}

/// Bring in remote commits: fast-forward when there is no local work, otherwise
/// rebase. A rebase that stops on a conflict is aborted and its files returned.
fn integrate(
    root: &Path,
    git_dir: &Path,
    ahead: u64,
) -> Result<Option<Vec<String>>, ProtocolError> {
    if ahead == 0 {
        run_ok(root, &["merge", "--ff-only", "--quiet", "@{u}"])?;
        return Ok(None);
    }
    let output = run(root, &["rebase", "--quiet", "@{u}"])?;
    if output.status.success() {
        return Ok(None);
    }
    if operation_in_progress(git_dir) != Some("rebase") {
        return Err(ProtocolError::new(
            ErrorCode::Git,
            format!("git rebase failed: {}", detail(&output)),
        ));
    }
    let conflicted = run_ok(root, &["diff", "--name-only", "--diff-filter=U", "-z"])?;
    let files = conflicted
        .split('\0')
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect();
    run_ok(root, &["rebase", "--abort"])?;
    Ok(Some(files))
}

/// True when a push failed only because the remote has commits this branch lacks.
fn push_was_rejected(message: &str) -> bool {
    ["[rejected]", "non-fast-forward", "fetch first"]
        .iter()
        .any(|marker| message.contains(marker))
}

/// Run one sync of the notes folder. `writes` is held while Git changes files,
/// so page writes from the app never land in the middle of a rebase.
pub fn sync(root: &Path, writes: &Mutex<()>) -> Result<Value, ProtocolError> {
    require_repo(root)?;
    let git_dir = git_dir(root)?;
    let mut done = Done::default();
    if let Some(operation) = operation_in_progress(&git_dir) {
        let message = format!(
            "Git is in the middle of a {operation} in this folder. Finish or abort it, then sync again."
        );
        return outcome(root, State::Conflict, &done, Vec::new(), Some(message));
    }
    let upstream = upstream(root)?;
    done.committed += {
        let _guard = lock(writes);
        commit_changes(root)?
    };

    for _ in 0..PUSH_ATTEMPTS {
        let fetch = run(root, &["fetch", "--quiet", &upstream.remote])?;
        if !fetch.status.success() {
            let message = Some(detail(&fetch));
            return outcome(root, State::Offline, &done, Vec::new(), message);
        }
        let (ahead, behind) = ahead_behind(root)?;
        if behind > 0 {
            let _guard = lock(writes);
            let committed = commit_changes(root)?;
            done.committed += committed;
            let ahead = ahead + u64::from(committed > 0);
            if let Some(files) = integrate(root, &git_dir, ahead)? {
                return outcome(root, State::Conflict, &done, files, None);
            }
            done.pulled = true;
        }
        if ahead_behind(root)?.0 == 0 {
            return outcome(root, State::Synced, &done, Vec::new(), None);
        }
        let target = format!("HEAD:{}", upstream.merge);
        let push = run(root, &["push", "--quiet", &upstream.remote, &target])?;
        if push.status.success() {
            return outcome(root, State::Synced, &done, Vec::new(), None);
        }
        let message = detail(&push);
        if !push_was_rejected(&message) {
            return outcome(root, State::Offline, &done, Vec::new(), Some(message));
        }
    }
    let message = "The remote kept changing while Quire pushed. Quire will try again.";
    outcome(
        root,
        State::Offline,
        &done,
        Vec::new(),
        Some(message.into()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git;
    use crate::testdir::TestDir;
    use std::fs;

    /// A notes folder published to a bare remote, and a second clone of it.
    struct Pair {
        _dir: TestDir,
        notes: PathBuf,
        other: PathBuf,
        remote: PathBuf,
        branch: String,
    }

    /// Publish a new notes folder and clone it next to itself.
    fn pair(name: &str) -> Pair {
        let dir = TestDir::new(name);
        let notes = dir.path().join("notes");
        let other = dir.path().join("other");
        let remote = dir.path().join("remote.git");
        let url = remote.to_string_lossy().into_owned();
        fs::create_dir(&notes).unwrap();
        fs::create_dir(&remote).unwrap();
        run_ok(&remote, &["init", "--bare"]).unwrap();
        git::init(&notes).unwrap();
        git::set_identity(&notes, "Ana Writer", "ana@example.com").unwrap();
        git::set_origin(&notes, &url).unwrap();
        git::publish(&notes).unwrap();
        let branch = query(&notes, &["symbolic-ref", "--short", "HEAD"]).unwrap();
        run_ok(
            dir.path(),
            &["clone", "--quiet", "--branch", &branch, &url, "other"],
        )
        .unwrap();
        git::set_identity(&other, "Ben Editor", "ben@example.com").unwrap();
        Pair {
            _dir: dir,
            notes,
            other,
            remote,
            branch,
        }
    }

    /// Write a file, creating its folders.
    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    /// Read a file with line endings normalized, since Git may check out CRLF on Windows.
    fn read(path: &Path) -> String {
        fs::read_to_string(path).unwrap().replace("\r\n", "\n")
    }

    /// Commit everything in a clone and push it, as another device would.
    fn push_from(clone: &Path, message: &str) {
        run_ok(clone, &["add", "--all"]).unwrap();
        run_ok(clone, &["commit", "--quiet", "--message", message]).unwrap();
        run_ok(clone, &["pull", "--quiet", "--rebase"]).unwrap();
        run_ok(clone, &["push", "--quiet"]).unwrap();
    }

    /// Commit subjects on the remote branch, newest first.
    fn remote_log(pair: &Pair) -> Vec<String> {
        run_ok(&pair.remote, &["log", "--format=%s", &pair.branch])
            .unwrap()
            .lines()
            .map(str::to_string)
            .collect()
    }

    #[test]
    fn maps_changed_files_to_pages() {
        let paths = [
            "README.md",
            "Trips/README.md",
            "Trips/assets/map.png",
            "Trips/Japan/README.md",
            "Trips/Japan/notes.txt",
            ".gitignore",
            ".obsidian/workspace.json",
        ];
        let pages: Vec<String> = changed_pages(paths).into_iter().collect();
        assert_eq!(pages, ["", "Trips", "Trips/Japan"]);
        assert_eq!(commit_message(0), "Quire: update notes");
        assert_eq!(commit_message(1), "Quire: update 1 page");
        assert_eq!(commit_message(4), "Quire: update 4 pages");
    }

    #[test]
    fn commits_and_pushes_local_changes() {
        let pair = pair("sync-push");
        let writes = Mutex::new(());
        write(&pair.notes.join("Trips").join("README.md"), "# Trips\n");
        write(&pair.notes.join("README.md"), "# Home\n\nTrips\n");

        let result = sync(&pair.notes, &writes).unwrap();
        assert_eq!(result["state"], json!("synced"));
        assert_eq!(result["committed"], json!(2));
        assert_eq!(result["ahead"], json!(0));
        assert_eq!(remote_log(&pair)[0], "Quire: update 2 pages");

        let again = sync(&pair.notes, &writes).unwrap();
        assert_eq!(again["state"], json!("synced"));
        assert_eq!(again["committed"], json!(0));
        assert_eq!(remote_log(&pair).len(), 2);
    }

    #[test]
    fn takes_remote_changes_and_rebases_local_work_onto_them() {
        let pair = pair("sync-rebase");
        let writes = Mutex::new(());
        let theirs = pair.other.join("Recipes").join("README.md");
        let mine = pair.notes.join("Recipes").join("README.md");
        write(&theirs, "# Recipes\n");
        push_from(&pair.other, "Add recipes");
        write(&pair.notes.join("README.md"), "# Home\n\nLocal line\n");

        let result = sync(&pair.notes, &writes).unwrap();
        assert_eq!(result["state"], json!("synced"));
        assert_eq!(result["pulled"], json!(true));
        assert_eq!(read(&mine), "# Recipes\n");
        let log = remote_log(&pair);
        assert_eq!(log[..2], ["Quire: update 1 page", "Add recipes"]);
        let merges = run_ok(&pair.notes, &["rev-list", "--merges", "--count", "HEAD"]);
        assert_eq!(merges.unwrap(), "0");

        write(&theirs, "# Recipes\n\nSoup\n");
        push_from(&pair.other, "Add soup");
        let result = sync(&pair.notes, &writes).unwrap();
        assert_eq!(result["state"], json!("synced"));
        assert_eq!(read(&mine), "# Recipes\n\nSoup\n");
    }

    #[test]
    fn stops_on_a_conflict_without_losing_local_work() {
        let pair = pair("sync-conflict");
        let writes = Mutex::new(());
        let dir = git_dir(&pair.notes).unwrap();
        write(&pair.other.join("README.md"), "# notes\n\nTheirs\n");
        push_from(&pair.other, "Their edit");
        write(&pair.notes.join("README.md"), "# notes\n\nMine\n");

        for _ in 0..2 {
            let result = sync(&pair.notes, &writes).unwrap();
            assert_eq!(result["state"], json!("conflict"));
            assert_eq!(result["files"], json!(["README.md"]));
            assert_eq!(result["ahead"], json!(1));
            assert_eq!(result["behind"], json!(1));
            assert_eq!(read(&pair.notes.join("README.md")), "# notes\n\nMine\n");
            assert_eq!(operation_in_progress(&dir), None);
        }
        assert_eq!(remote_log(&pair)[0], "Their edit");
    }

    #[test]
    fn keeps_commits_locally_when_the_remote_is_unreachable() {
        let pair = pair("sync-offline");
        let writes = Mutex::new(());
        let gone = pair.notes.parent().unwrap().join("missing.git");
        let url = gone.to_string_lossy().into_owned();
        git::set_origin(&pair.notes, &url).unwrap();
        write(&pair.notes.join("README.md"), "# Home\n\nOffline edit\n");

        let result = sync(&pair.notes, &writes).unwrap();
        assert_eq!(result["state"], json!("offline"));
        assert_eq!(result["committed"], json!(1));
        assert_eq!(result["ahead"], json!(1));
        let message = result["message"].as_str().unwrap_or_default();
        assert!(!message.is_empty());
    }

    #[test]
    fn leaves_an_unfinished_git_operation_alone() {
        let pair = pair("sync-busy");
        let writes = Mutex::new(());
        let marker = git_dir(&pair.notes).unwrap().join("MERGE_HEAD");
        fs::write(&marker, "0000000000000000000000000000000000000000\n").unwrap();
        write(&pair.notes.join("README.md"), "# Home\n\nWaiting\n");

        let result = sync(&pair.notes, &writes).unwrap();
        assert_eq!(result["state"], json!("conflict"));
        assert!(result["message"].as_str().unwrap().contains("merge"));
        assert_eq!(result["committed"], json!(0));
    }
}
