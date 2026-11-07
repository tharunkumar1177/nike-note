//! Page paths: relative, `/`-separated folder paths that must resolve inside
//! the notes folder, even after following symbolic links.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use crate::protocol::{ErrorCode, ProtocolError};

/// A page folder resolved on disk, with the notes folder it was checked against.
#[derive(Debug)]
pub struct PageDir {
    /// The page folder with symbolic links resolved.
    pub dir: PathBuf,
    /// The notes folder with symbolic links resolved.
    pub root: PathBuf,
}

impl PageDir {
    /// True when `path` (resolved) is inside the notes folder.
    pub fn contains(&self, path: &Path) -> bool {
        path.starts_with(&self.root)
    }
}

/// The error for a path that leaves the notes folder.
pub fn outside(page: &str) -> ProtocolError {
    ProtocolError::new(
        ErrorCode::OutsideRoot,
        format!("\"{page}\" is outside the notes folder."),
    )
}

/// Resolve a page path to its folder, refusing anything outside the notes folder.
pub fn page_dir(root: &Path, page: &str) -> Result<PageDir, ProtocolError> {
    let drive_like = cfg!(windows) && page.contains(':');
    if page.starts_with('/') || page.contains('\\') || page.contains('\0') || drive_like {
        return Err(outside(page));
    }
    let mut dir = root.to_path_buf();
    if !page.is_empty() {
        for segment in page.split('/') {
            match segment {
                "" => {
                    return Err(ProtocolError::new(
                        ErrorCode::BadRequest,
                        format!("\"{page}\" has an empty folder name."),
                    ));
                }
                "." | ".." => return Err(outside(page)),
                name => dir.push(name),
            }
        }
    }

    let real_root = fs::canonicalize(root).map_err(|_| {
        ProtocolError::new(
            ErrorCode::NotFound,
            format!("The notes folder {} no longer exists.", root.display()),
        )
    })?;
    let real_dir = fs::canonicalize(&dir).map_err(|error| match error.kind() {
        ErrorKind::NotFound => ProtocolError::new(
            ErrorCode::NotFound,
            format!("The page \"{page}\" no longer exists."),
        ),
        _ => ProtocolError::new(ErrorCode::Io, format!("Cannot open \"{page}\": {error}")),
    })?;
    let resolved = PageDir {
        dir: real_dir,
        root: real_root,
    };
    if !resolved.contains(&resolved.dir) {
        return Err(outside(page));
    }
    if !resolved.dir.is_dir() {
        return Err(ProtocolError::new(
            ErrorCode::NotFound,
            format!("The page \"{page}\" is not a folder."),
        ));
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    #[test]
    fn resolves_nested_pages_and_the_root() {
        let dir = TestDir::new("paths");
        fs::create_dir_all(dir.path().join("Trips").join("Japan 2027")).unwrap();
        let page = page_dir(dir.path(), "Trips/Japan 2027").unwrap();
        assert!(page.dir.ends_with("Japan 2027"));
        assert_eq!(page_dir(dir.path(), "").unwrap().dir, page.root);
    }

    #[test]
    fn refuses_paths_that_leave_the_root() {
        let dir = TestDir::new("paths-escape");
        fs::create_dir_all(dir.path().join("a")).unwrap();
        for page in ["..", "a/..", "a/../..", "/etc", "a\\b", "./a"] {
            assert_eq!(
                page_dir(dir.path(), page).unwrap_err().code,
                ErrorCode::OutsideRoot,
                "{page}"
            );
        }
        assert_eq!(
            page_dir(dir.path(), "a//b").unwrap_err().code,
            ErrorCode::BadRequest
        );
        assert_eq!(
            page_dir(dir.path(), "missing").unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symbolic_links_out_of_the_root() {
        let dir = TestDir::new("paths-link");
        let root = dir.path().join("notes");
        let elsewhere = dir.path().join("elsewhere");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&elsewhere).unwrap();
        std::os::unix::fs::symlink(&elsewhere, root.join("link")).unwrap();
        assert_eq!(
            page_dir(&root, "link").unwrap_err().code,
            ErrorCode::OutsideRoot
        );
    }
}
