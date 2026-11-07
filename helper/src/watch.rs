//! File watching: reports changes in the notes folder to the app as debounced
//! `filesChanged` events (see architecture.md, File write-back and change watching).

use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::json;

use crate::pages::README;
use crate::protocol::Outgoing;

/// Quiet time after the last change before a batch is reported.
const QUIET: Duration = Duration::from_millis(150);

/// Longest a batch is held back while changes keep arriving.
const MAX_DELAY: Duration = Duration::from_secs(1);

/// How often an idle reporter checks whether its watch was dropped.
const IDLE_POLL: Duration = Duration::from_millis(250);

/// Most page paths listed in one event; a larger batch is reported as a rescan.
const MAX_PAGES: usize = 500;

/// A running watch on one notes folder. Dropping it stops the watch, and its
/// reporter thread exits soon after, releasing its handle on the output.
pub struct PageWatch {
    stop: Arc<AtomicBool>,
    _watcher: RecommendedWatcher,
}

impl Drop for PageWatch {
    /// Tell the reporter thread to finish.
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

/// What one changed path means for the app.
#[derive(Debug, PartialEq, Eq)]
enum Change {
    /// The body of the page at this path changed.
    Body(String),
    /// Something else that can change the page tree, such as a folder.
    Tree,
}

/// Start watching `root` recursively; batches of changes are sent through `out`.
pub fn start(root: &Path, out: Sender<Outgoing>) -> notify::Result<PageWatch> {
    let real_root = root.canonicalize()?;
    let (sender, receiver) = mpsc::channel::<notify::Result<Event>>();
    let mut watcher = notify::recommended_watcher(sender)?;
    watcher.watch(&real_root, RecursiveMode::Recursive)?;
    let stop = Arc::new(AtomicBool::new(false));
    let bases = vec![real_root, root.to_path_buf()];
    let stopped = Arc::clone(&stop);
    thread::spawn(move || report(&receiver, &bases, &out, &stopped));
    Ok(PageWatch {
        stop,
        _watcher: watcher,
    })
}

/// Collect changes into batches and send one event per batch until the watch
/// is dropped or the output closes.
fn report(
    receiver: &Receiver<notify::Result<Event>>,
    bases: &[PathBuf],
    out: &Sender<Outgoing>,
    stop: &AtomicBool,
) {
    let mut batch = Batch::default();
    let mut started: Option<Instant> = None;
    while !stop.load(Ordering::Relaxed) {
        let overdue = started.is_some_and(|start| start.elapsed() >= MAX_DELAY);
        let received = if overdue {
            Err(RecvTimeoutError::Timeout)
        } else {
            receiver.recv_timeout(if started.is_some() { QUIET } else { IDLE_POLL })
        };
        match received {
            Ok(event) => {
                batch.add(event, bases);
                if started.is_none() && !batch.is_empty() {
                    started = Some(Instant::now());
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                if started.take().is_some() && out.send(batch.take_event()).is_err() {
                    return;
                }
            }
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

/// Changes collected since the last event.
#[derive(Default)]
struct Batch {
    pages: BTreeSet<String>,
    tree: bool,
    rescan: bool,
}

impl Batch {
    /// True when nothing worth reporting has been collected.
    fn is_empty(&self) -> bool {
        self.pages.is_empty() && !self.tree && !self.rescan
    }

    /// Add one watcher notification. Errors and overflows ask the app to rescan.
    fn add(&mut self, event: notify::Result<Event>, bases: &[PathBuf]) {
        let Ok(event) = event else {
            self.rescan = true;
            return;
        };
        if event.need_rescan() {
            self.rescan = true;
        }
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        for path in &event.paths {
            match classify(path, bases) {
                Some(Change::Body(page)) => {
                    self.pages.insert(page);
                }
                Some(Change::Tree) => self.tree = true,
                None => {}
            }
        }
    }

    /// Turn the batch into a `filesChanged` event and start a new one.
    fn take_event(&mut self) -> Outgoing {
        let batch = std::mem::take(self);
        let rescan = batch.rescan || batch.pages.len() > MAX_PAGES;
        let pages: Vec<String> = if rescan {
            Vec::new()
        } else {
            batch.pages.into_iter().collect()
        };
        Outgoing::Event {
            event: "filesChanged",
            data: json!({ "pages": pages, "rescan": rescan }),
        }
    }
}

/// What a changed path means, or None for paths the app does not show:
/// anything outside the notes folder, inside a dot folder such as `.git` or an
/// `assets` folder, and dot files such as Quire's temporary files.
fn classify(path: &Path, bases: &[PathBuf]) -> Option<Change> {
    let relative = bases.iter().find_map(|base| path.strip_prefix(base).ok())?;
    let mut names = Vec::new();
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return None;
        };
        let name = name.to_string_lossy();
        if name.starts_with('.') || name == "assets" {
            return None;
        }
        names.push(name.into_owned());
    }
    if names.last().is_some_and(|last| last == README) {
        names.pop();
        return Some(Change::Body(names.join("/")));
    }
    Some(Change::Tree)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;
    use serde_json::Value;
    use std::fs;

    #[test]
    fn classifies_changed_paths() {
        let base = PathBuf::from("notes");
        let bases = [base.clone()];
        let at = |path: &str| classify(&base.join(path), &bases);
        assert_eq!(at("README.md"), Some(Change::Body(String::new())));
        assert_eq!(
            at("Trips/Japan/README.md"),
            Some(Change::Body("Trips/Japan".into()))
        );
        assert_eq!(at("Trips/New"), Some(Change::Tree));
        assert_eq!(at(".git/index"), None);
        assert_eq!(at("Trips/.README.md.1.0.tmp"), None);
        assert_eq!(at("assets/photo.png"), None);
        assert_eq!(classify(Path::new("elsewhere/README.md"), &bases), None);
    }

    #[test]
    fn large_batches_become_a_rescan() {
        let mut batch = Batch {
            pages: (0..=MAX_PAGES).map(|index| index.to_string()).collect(),
            ..Batch::default()
        };
        let data = batch.take_event().to_value()["data"].clone();
        assert_eq!(data, json!({ "pages": [], "rescan": true }));
        assert!(batch.is_empty());
    }

    #[test]
    fn reports_page_changes_as_events() {
        let dir = TestDir::new("watch");
        fs::create_dir_all(dir.path().join("Trip")).unwrap();
        let (sender, receiver) = mpsc::channel();
        let watch = start(dir.path(), sender).unwrap();
        fs::create_dir_all(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".git").join("index"), "x").unwrap();
        fs::write(dir.path().join("Trip").join(README), "# Trip\n").unwrap();

        let deadline = Instant::now() + Duration::from_secs(20);
        let mut reported = false;
        while !reported && Instant::now() < deadline {
            let Ok(message) = receiver.recv_timeout(Duration::from_millis(500)) else {
                continue;
            };
            let value = message.to_value();
            assert_eq!(value["event"], json!("filesChanged"));
            let data = &value["data"];
            let pages = data["pages"].as_array().cloned().unwrap_or_default();
            reported = pages.contains(&json!("Trip")) || data["rescan"] == Value::Bool(true);
        }
        drop(watch);
        assert!(reported, "no filesChanged event for Trip");
    }
}
