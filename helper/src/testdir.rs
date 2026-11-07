//! Unique temporary folders for unit tests, removed when dropped.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static COUNTER: AtomicU32 = AtomicU32::new(0);

/// A fresh, empty folder under the system temp folder.
pub struct TestDir {
    path: PathBuf,
}

impl TestDir {
    /// Create a uniquely named folder with a readable prefix.
    pub fn new(prefix: &str) -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        let unique = format!(
            "quire-test-{prefix}-{}-{}-{nanos}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let path = std::env::temp_dir().join(unique);
        fs::create_dir_all(&path).expect("create test folder");
        Self { path }
    }

    /// The folder's path.
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestDir {
    /// Remove the folder and everything in it.
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}
