//! Page bodies: read a page's `README.md` exactly, and replace it atomically
//! only while it still matches the version the app last read (see
//! architecture.md, File write-back and change watching).

use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::pages::README;
use crate::paths::{PageDir, outside, page_dir};
use crate::protocol::{ErrorCode, ProtocolError};

/// Largest page body read or written; JSON escaping must fit the 1 MiB message limit.
pub const MAX_PAGE_BYTES: u64 = 512 * 1024;

/// Attempts at replacing a file that another program briefly holds open (Windows).
const REPLACE_ATTEMPTS: u64 = 5;

/// Distinguishes the temporary files written by one helper process.
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Lowercase hex SHA-256 of `bytes`: the version tag of a page body.
pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// The error for a `README.md` that cannot be read.
fn read_error(error: std::io::Error) -> ProtocolError {
    ProtocolError::new(ErrorCode::Io, format!("Cannot read {README}: {error}"))
}

/// The error for a body over the size limit.
fn too_large(bytes: u64) -> ProtocolError {
    ProtocolError::new(
        ErrorCode::TooLarge,
        format!(
            "This page is {} KB. Quire can open pages up to {} KB.",
            bytes / 1024,
            MAX_PAGE_BYTES / 1024
        ),
    )
}

/// The page's `README.md` with symbolic links resolved, or None when the page has none yet.
fn existing_file(resolved: &PageDir, page: &str) -> Result<Option<PathBuf>, ProtocolError> {
    let file = resolved.dir.join(README);
    let real_file = match fs::canonicalize(&file) {
        Ok(real_file) => real_file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(read_error(error)),
    };
    if !resolved.contains(&real_file) {
        return Err(outside(page));
    }
    if !real_file.is_file() {
        return Err(ProtocolError::new(
            ErrorCode::Io,
            format!("{README} in \"{page}\" is not a file."),
        ));
    }
    Ok(Some(real_file))
}

/// Read a file's bytes, refusing files over the size limit.
fn read_limited(file: &Path) -> Result<Vec<u8>, ProtocolError> {
    let size = fs::metadata(file).map_err(read_error)?.len();
    if size > MAX_PAGE_BYTES {
        return Err(too_large(size));
    }
    fs::read(file).map_err(read_error)
}

/// Read a page body and its hash. A page folder without `README.md` has an
/// empty body and no hash.
pub fn read_page(root: &Path, page: &str) -> Result<Value, ProtocolError> {
    let resolved = page_dir(root, page)?;
    let Some(file) = existing_file(&resolved, page)? else {
        return Ok(json!({ "path": page, "exists": false, "content": "", "hash": null }));
    };
    let bytes = read_limited(&file)?;
    let hash = sha256_hex(&bytes);
    let content = String::from_utf8(bytes).map_err(|_| {
        ProtocolError::new(
            ErrorCode::Io,
            format!("{README} in \"{page}\" is not UTF-8 text, so Quire cannot open it."),
        )
    })?;
    Ok(json!({ "path": page, "exists": true, "content": content, "hash": hash }))
}

/// Replace a page body when the file on disk still has `base_hash`, or does
/// not exist yet when `base_hash` is None. Returns the new hash.
pub fn write_page(
    root: &Path,
    page: &str,
    content: &str,
    base_hash: Option<&str>,
) -> Result<Value, ProtocolError> {
    let size = content.len() as u64;
    if size > MAX_PAGE_BYTES {
        return Err(too_large(size));
    }
    let resolved = page_dir(root, page)?;
    let existing = existing_file(&resolved, page)?;
    let current = match &existing {
        Some(file) => Some(sha256_hex(&read_limited(file)?)),
        None => None,
    };
    if current.as_deref() != base_hash {
        return Err(ProtocolError::new(
            ErrorCode::Stale,
            format!("{README} in \"{page}\" changed on disk after Quire read it."),
        ));
    }
    let target = existing.unwrap_or_else(|| resolved.dir.join(README));
    if let Err(error) = replace_file(&target, content.as_bytes()) {
        return Err(ProtocolError::new(
            ErrorCode::Io,
            format!("Cannot save {README} in \"{page}\": {error}"),
        ));
    }
    Ok(json!({ "path": page, "hash": sha256_hex(content.as_bytes()) }))
}

/// Write `bytes` to a new temporary file beside `target`, flush it to disk, and
/// rename it over `target`, so readers see either the old or the new file.
fn replace_file(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let folder = target.parent().unwrap_or(Path::new("."));
    let temp = folder.join(format!(
        ".{README}.{}.{}.tmp",
        std::process::id(),
        TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let written = write_new(&temp, bytes, target).and_then(|()| rename_with_retry(&temp, target));
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written
}

/// Create `temp` with `bytes`, copy the permissions of `like` when it exists, and sync it.
fn write_new(temp: &Path, bytes: &[u8], like: &Path) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    let mut file = options.write(true).create_new(true).open(temp)?;
    file.write_all(bytes)?;
    if let Ok(metadata) = fs::metadata(like) {
        file.set_permissions(metadata.permissions())?;
    }
    file.sync_all()
}

/// Rename `from` over `to`, retrying briefly while another program has `to` open.
fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    for attempt in 1..REPLACE_ATTEMPTS {
        match fs::rename(from, to) {
            Err(error) if error.kind() == ErrorKind::PermissionDenied => {
                thread::sleep(Duration::from_millis(50 * attempt));
            }
            result => return result,
        }
    }
    fs::rename(from, to)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    /// Write a file, creating its folders.
    fn write(root: &Path, path: &str, text: &str) {
        let file = root.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, text).unwrap();
    }

    /// Names of the entries in a folder.
    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn hashes_are_lowercase_sha256() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn reads_page_bodies_exactly() {
        let dir = TestDir::new("body-read");
        let body = "\u{feff}# Trip\r\n\r\nTokyo é\n";
        write(dir.path(), "Trips/README.md", body);
        fs::create_dir_all(dir.path().join("Empty")).unwrap();

        let page = read_page(dir.path(), "Trips").unwrap();
        assert_eq!(page["exists"], json!(true));
        assert_eq!(page["content"], json!(body));
        assert_eq!(page["hash"], json!(sha256_hex(body.as_bytes())));
        let empty = read_page(dir.path(), "Empty").unwrap();
        assert_eq!(empty["exists"], json!(false));
        assert_eq!(empty["content"], json!(""));
        assert_eq!(empty["hash"], Value::Null);
        assert_eq!(
            read_page(dir.path(), "../x").unwrap_err().code,
            ErrorCode::OutsideRoot
        );
    }

    #[test]
    fn refuses_large_and_non_text_bodies() {
        let dir = TestDir::new("body-refuse");
        write(
            dir.path(),
            "Big/README.md",
            &"a".repeat(MAX_PAGE_BYTES as usize + 1),
        );
        fs::create_dir_all(dir.path().join("Binary")).unwrap();
        fs::write(dir.path().join("Binary").join(README), [0xff, 0xfe, 0x00]).unwrap();
        fs::create_dir_all(dir.path().join("Odd").join(README)).unwrap();

        assert_eq!(
            read_page(dir.path(), "Big").unwrap_err().code,
            ErrorCode::TooLarge
        );
        assert_eq!(
            read_page(dir.path(), "Binary").unwrap_err().code,
            ErrorCode::Io
        );
        assert_eq!(
            read_page(dir.path(), "Odd").unwrap_err().code,
            ErrorCode::Io
        );
    }

    #[test]
    fn writes_only_over_the_version_that_was_read() {
        let dir = TestDir::new("body-write");
        let folder = dir.path().join("Trip");
        fs::create_dir_all(&folder).unwrap();

        let created = write_page(dir.path(), "Trip", "# Trip\n", None).unwrap();
        let first = created["hash"].as_str().unwrap().to_string();
        assert_eq!(read_page(dir.path(), "Trip").unwrap()["hash"], json!(first));

        let again = write_page(dir.path(), "Trip", "# Again\n", None);
        assert_eq!(again.unwrap_err().code, ErrorCode::Stale);
        let wrong = "0".repeat(64);
        let stale = write_page(dir.path(), "Trip", "# Old\n", Some(&wrong));
        assert_eq!(stale.unwrap_err().code, ErrorCode::Stale);

        let body = "# Trip\r\nTokyo\r\n";
        let saved = write_page(dir.path(), "Trip", body, Some(&first)).unwrap();
        let read = read_page(dir.path(), "Trip").unwrap();
        assert_eq!(read["content"], json!(body));
        assert_eq!(read["hash"], saved["hash"]);
        assert_eq!(names(&folder), vec![README]);
    }

    #[test]
    fn refuses_writes_that_are_too_large_or_outside_the_root() {
        let dir = TestDir::new("body-write-refuse");
        fs::create_dir_all(dir.path().join("Trip")).unwrap();
        let big = "a".repeat(MAX_PAGE_BYTES as usize + 1);
        let cases = [
            ("Trip", big.as_str(), ErrorCode::TooLarge),
            ("../x", "", ErrorCode::OutsideRoot),
            ("Missing", "", ErrorCode::NotFound),
        ];
        for (page, content, code) in cases {
            let result = write_page(dir.path(), page, content, None);
            assert_eq!(result.unwrap_err().code, code, "{page}");
        }
        assert_eq!(names(&dir.path().join("Trip")), Vec::<String>::new());
    }
}
