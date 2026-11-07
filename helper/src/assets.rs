//! Page images (see architecture.md, Page assets): chunked reads of image
//! files anywhere in the notes folder, and writes of new images into a page's
//! `assets` folder.

use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Seek, SeekFrom, Write};
use std::path::Path;

use serde_json::{Value, json};

use crate::base64;
use crate::pageops::folder_name;
use crate::paths::{outside, page_dir};
use crate::protocol::{ErrorCode, ProtocolError};

/// Bytes returned per `readAsset` reply; base64 keeps the reply under 1 MiB.
pub const CHUNK_BYTES: usize = 512 * 1024;
/// Largest image `readAsset` serves.
pub const MAX_READ_BYTES: u64 = 32 * 1024 * 1024;
/// Largest image `writeAsset` accepts.
pub const MAX_WRITE_BYTES: usize = 16 * 1024 * 1024;
/// The folder inside a page that holds its images.
pub const ASSETS: &str = "assets";

/// Image file extensions and the media type each is served as.
const IMAGE_TYPES: [(&str, &str); 8] = [
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("avif", "image/avif"),
    ("bmp", "image/bmp"),
    ("svg", "image/svg+xml"),
];

/// The media type for a file name's extension, when it names an image.
fn image_type(name: &str) -> Option<&'static str> {
    let (_, extension) = name.rsplit_once('.')?;
    IMAGE_TYPES
        .iter()
        .find(|(known, _)| extension.eq_ignore_ascii_case(known))
        .map(|&(_, media)| media)
}

/// An IO error while reading or writing an image.
fn io_error(verb: &str, error: std::io::Error) -> ProtocolError {
    ProtocolError::new(ErrorCode::Io, format!("Cannot {verb} the image: {error}"))
}

/// True when a file name could name something outside its folder or is hidden.
fn unsafe_file_name(name: &str) -> bool {
    name.is_empty()
        || name.starts_with('.')
        || name.contains(['/', '\\', '\0'])
        || (cfg!(windows) && name.contains(':'))
}

/// Read up to 512 KiB of the image at `path` (relative to the notes folder,
/// `/`-separated) from byte `offset`. Answers `{ path, size, offset, mime,
/// data }` with the bytes in base64; the app asks again from `offset` plus the
/// decoded length until it has `size` bytes.
pub fn read_asset(root: &Path, path: &str, offset: u64) -> Result<Value, ProtocolError> {
    let (folder, name) = path.rsplit_once('/').unwrap_or(("", path));
    if unsafe_file_name(name) || folder.split('/').any(|segment| segment.starts_with('.')) {
        return Err(outside(path));
    }
    let mime = image_type(name).ok_or_else(|| {
        ProtocolError::new(
            ErrorCode::BadRequest,
            format!("\"{path}\" is not an image."),
        )
    })?;
    let dir = page_dir(root, folder)?;
    let file = fs::canonicalize(dir.dir.join(name)).map_err(|error| match error.kind() {
        ErrorKind::NotFound => ProtocolError::new(
            ErrorCode::NotFound,
            format!("The image \"{path}\" does not exist."),
        ),
        _ => io_error("open", error),
    })?;
    if !dir.contains(&file) {
        return Err(outside(path));
    }
    let size = fs::metadata(&file)
        .map_err(|error| io_error("open", error))?
        .len();
    if !file.is_file() {
        return Err(ProtocolError::new(
            ErrorCode::NotFound,
            format!("\"{path}\" is a folder, not an image file."),
        ));
    }
    if size > MAX_READ_BYTES {
        return Err(ProtocolError::new(
            ErrorCode::TooLarge,
            format!("\"{path}\" is larger than 32 MiB."),
        ));
    }
    if offset > size {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            format!("Offset {offset} is past the end of \"{path}\"."),
        ));
    }
    let mut reader = File::open(&file).map_err(|error| io_error("open", error))?;
    reader
        .seek(SeekFrom::Start(offset))
        .map_err(|error| io_error("read", error))?;
    let mut bytes = Vec::with_capacity(CHUNK_BYTES.min((size - offset) as usize));
    reader
        .take(CHUNK_BYTES as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| io_error("read", error))?;
    Ok(json!({
        "path": path,
        "size": size,
        "offset": offset,
        "mime": mime,
        "data": base64::encode(&bytes),
    }))
}

/// A portable file name for an image called `name`: the stem gets the same
/// cleaning as page folder names, and the extension is lowercased. Returns
/// None when `name` has no image extension.
fn image_file_name(name: &str) -> Option<String> {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
    image_type(base)?;
    let (stem, extension) = base.rsplit_once('.')?;
    let stem = if stem.trim_matches(['.', ' ']).is_empty() {
        "image".to_string()
    } else {
        folder_name(stem)
    };
    Some(format!("{stem}.{}", extension.to_ascii_lowercase()))
}

/// `file`, or `stem 2.ext`, `stem 3.ext`, and so on: the first name no entry in
/// `dir` uses, compared without case.
fn unique_file_name(dir: &Path, file: &str) -> Result<String, ProtocolError> {
    let taken: HashSet<String> = fs::read_dir(dir)
        .map_err(|error| io_error("save", error))?
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().to_lowercase())
        .collect();
    let (stem, extension) = file.rsplit_once('.').unwrap_or((file, ""));
    std::iter::once(file.to_string())
        .chain((2..10_000).map(|n| format!("{stem} {n}.{extension}")))
        .find(|name| !taken.contains(&name.to_lowercase()))
        .ok_or_else(|| ProtocolError::new(ErrorCode::Io, "Too many images share this name."))
}

/// Save image bytes (`data`, base64) as a new file named after `name` in page
/// `page`'s `assets` folder, which is created when missing. The file is
/// written under a temporary name and renamed into place, and never replaces
/// an existing file. Answers `{ path, name }`: the file's path in the notes
/// folder and its name in `assets`.
pub fn write_asset(
    root: &Path,
    page: &str,
    name: &str,
    data: &str,
) -> Result<Value, ProtocolError> {
    let file_name = image_file_name(name).ok_or_else(|| {
        ProtocolError::new(
            ErrorCode::BadRequest,
            format!("\"{name}\" is not an image."),
        )
    })?;
    if data.len() > MAX_WRITE_BYTES.div_ceil(3) * 4 {
        return Err(ProtocolError::new(
            ErrorCode::TooLarge,
            "Images larger than 16 MiB cannot be added.",
        ));
    }
    let bytes = base64::decode(data)
        .filter(|bytes| !bytes.is_empty())
        .ok_or_else(|| ProtocolError::new(ErrorCode::BadRequest, "The image data is invalid."))?;

    let dir = page_dir(root, page)?;
    let assets = dir.dir.join(ASSETS);
    if fs::symlink_metadata(&assets).is_ok_and(|meta| !meta.is_dir()) {
        return Err(ProtocolError::new(
            ErrorCode::Io,
            "The page's assets entry exists but is not a folder.",
        ));
    }
    fs::create_dir_all(&assets).map_err(|error| io_error("save", error))?;
    let name = unique_file_name(&assets, &file_name)?;
    let temporary = assets.join(format!(".{name}.quire-tmp"));
    let written = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .and_then(|mut file| {
            file.write_all(&bytes)?;
            file.sync_all()
        })
        .and_then(|()| fs::rename(&temporary, assets.join(&name)));
    if let Err(error) = written {
        let _ = fs::remove_file(&temporary);
        return Err(io_error("save", error));
    }
    let path = if page.is_empty() {
        format!("{ASSETS}/{name}")
    } else {
        format!("{page}/{ASSETS}/{name}")
    };
    Ok(json!({ "path": path, "name": name }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    /// Decode the `data` field of a `readAsset` reply.
    fn data(reply: &Value) -> Vec<u8> {
        base64::decode(reply["data"].as_str().unwrap()).unwrap()
    }

    #[test]
    fn reads_an_image_in_chunks() {
        let dir = TestDir::new("assets-read");
        let root = dir.path();
        fs::create_dir_all(root.join("Trips/assets")).unwrap();
        let bytes: Vec<u8> = (0..CHUNK_BYTES + 10).map(|n| (n % 251) as u8).collect();
        fs::write(root.join("Trips/assets/map.PNG"), &bytes).unwrap();

        let first = read_asset(root, "Trips/assets/map.PNG", 0).unwrap();
        assert_eq!(first["size"], json!(bytes.len()));
        assert_eq!(first["mime"], json!("image/png"));
        assert_eq!(data(&first), bytes[..CHUNK_BYTES]);
        let rest = read_asset(root, "Trips/assets/map.PNG", CHUNK_BYTES as u64).unwrap();
        assert_eq!(data(&rest), bytes[CHUNK_BYTES..]);
    }

    #[test]
    fn refuses_files_that_are_not_safe_images() {
        let dir = TestDir::new("assets-refuse");
        let root = dir.path();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join("notes.txt"), "x").unwrap();
        fs::write(root.join(".git/a.png"), "x").unwrap();
        fs::write(root.join("a.png"), "x").unwrap();
        let code = |path: &str, offset: u64| read_asset(root, path, offset).unwrap_err().code;
        assert_eq!(code("notes.txt", 0), ErrorCode::BadRequest);
        assert_eq!(code(".git/a.png", 0), ErrorCode::OutsideRoot);
        assert_eq!(code("../a.png", 0), ErrorCode::OutsideRoot);
        assert_eq!(code("a\\b.png", 0), ErrorCode::OutsideRoot);
        assert_eq!(code("missing.png", 0), ErrorCode::NotFound);
        assert_eq!(code("a.png", 2), ErrorCode::BadRequest);
    }

    #[test]
    fn saves_images_under_portable_unique_names() {
        let dir = TestDir::new("assets-write");
        let root = dir.path();
        fs::create_dir_all(root.join("Trips")).unwrap();
        let data = base64::encode(b"\x89PNG");

        let saved = write_asset(root, "Trips", "Screen shot: 1.PNG", &data).unwrap();
        assert_eq!(
            saved,
            json!({ "path": "Trips/assets/Screen shot 1.png", "name": "Screen shot 1.png" })
        );
        assert_eq!(
            fs::read(root.join("Trips/assets/Screen shot 1.png")).unwrap(),
            b"\x89PNG"
        );
        let again = write_asset(root, "Trips", "screen shot 1.png", &data).unwrap();
        assert_eq!(again["name"], json!("screen shot 1 2.png"));
        let unnamed = write_asset(root, "", ".png", &data).unwrap();
        assert_eq!(unnamed["path"], json!("assets/image.png"));

        let refuse =
            |name: &str, data: &str| write_asset(root, "Trips", name, data).unwrap_err().code;
        assert_eq!(refuse("notes.txt", &data), ErrorCode::BadRequest);
        assert_eq!(refuse("a.png", "not base64"), ErrorCode::BadRequest);
        assert_eq!(refuse("a.png", ""), ErrorCode::BadRequest);
        let leftovers = fs::read_dir(root.join("Trips/assets")).unwrap().count();
        assert_eq!(leftovers, 2);
    }
}
