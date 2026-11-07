//! Page operations that change the folder structure (see architecture.md,
//! Page structure): creating a sub-page as a new folder with a `README.md`,
//! renaming, moving, and deleting pages. Parents' link lines and relative
//! links elsewhere in the notes folder follow a moved page.

use std::collections::HashSet;
use std::fmt::Write as _;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::body::{Body, read_body, write_page};
use crate::dirs::validate_folder_name;
use crate::pages::{README, heading_title, line_title, link_target_folder, prose_mask};
use crate::paths::page_dir;
use crate::protocol::{ErrorCode, ProtocolError};
use crate::relink::{Move, relink};

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
/// other than `except` uses, compared without case so it works on
/// case-insensitive disks.
fn unique_name(dir: &Path, base: &str, except: Option<&str>) -> Result<String, ProtocolError> {
    let except = except.map(str::to_lowercase);
    let taken: HashSet<String> = fs::read_dir(dir)
        .map_err(io_error)?
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().to_lowercase())
        .filter(|name| Some(name) != except.as_ref())
        .collect();
    std::iter::once(base.to_string())
        .chain((2..10_000).map(|n| format!("{base} {n}")))
        .find(|name| !taken.contains(&name.to_lowercase()))
        .ok_or_else(|| ProtocolError::new(ErrorCode::Io, "Too many pages share this name."))
}

/// Create a sub-page of `parent` titled `title`: a new folder named after the
/// title and a `README.md` whose first line is `# <title>`. With `link`, a
/// link line to it is also added at the end of the parent's body. Returns the
/// new page path, its folder name, and the title used.
pub fn create_page(
    root: &Path,
    parent: &str,
    title: &str,
    link: bool,
) -> Result<Value, ProtocolError> {
    let resolved = page_dir(root, parent)?;
    let title = clean_title(title);
    let parent_body = if link {
        Some(read_body(root, parent)?)
    } else {
        None
    };
    let name = unique_name(&resolved.dir, &folder_name(&title), None)?;
    validate_folder_name(&name)?;
    let folder = resolved.dir.join(&name);
    fs::create_dir(&folder).map_err(|error| match error.kind() {
        ErrorKind::AlreadyExists => ProtocolError::new(
            ErrorCode::Io,
            format!("A folder named \"{name}\" appeared while the page was created."),
        ),
        _ => io_error(error),
    })?;
    if let Err(error) = fs::write(folder.join(README), format!("# {title}\n")) {
        let _ = fs::remove_dir(&folder);
        return Err(io_error(error));
    }
    if let Some(body) = parent_body {
        let next = append_line(&body.content, &link_line(&title, &name));
        write_body(root, parent, &body, &next)?;
    }
    let path = child_path(parent, &name);
    Ok(json!({ "path": path, "folder": name, "title": title }))
}

/// Rename page `page` to `title`. The title line of its body is replaced (or
/// added), and while the folder name still follows the old title, the folder
/// is renamed after the new one. The parent's link lines get the new title
/// and folder, and links elsewhere follow a renamed folder. Returns the page
/// path, folder name, and title after the rename.
pub fn rename_page(root: &Path, page: &str, title: &str) -> Result<Value, ProtocolError> {
    let title = clean_title(title);
    let body = read_body(root, page)?;
    let (parent, folder) = split_path(page);
    let heading = heading_title(without_bom(&body.content));
    let old_title = heading.unwrap_or_else(|| folder.to_string());
    let next = with_title(&body.content, &title);
    if next != body.content {
        write_body(root, page, &body, &next)?;
    }
    if page.is_empty() {
        return Ok(json!({ "path": "", "folder": "", "title": title }));
    }

    let source = own_folder(root, page, "renamed")?;
    let mut name = folder.to_string();
    if follows_title(folder, &old_title) && !follows_title(folder, &title) {
        let parent_dir = page_dir(root, parent)?.dir;
        name = unique_name(&parent_dir, &folder_name(&title), Some(folder))?;
        validate_folder_name(&name)?;
    }
    let parent_body = read_body(root, parent)?;
    if name != folder {
        let target = source.with_file_name(&name);
        fs::rename(&source, &target).map_err(|error| {
            ProtocolError::new(
                ErrorCode::Io,
                format!("Cannot rename the page folder: {error}"),
            )
        })?;
    }
    let line = link_line(&title, &name);
    let relinked = replace_link_lines(&parent_body.content, folder, Some(&line))
        .filter(|next| *next != parent_body.content);
    if let Some(next) = relinked {
        write_body(root, parent, &parent_body, &next)?;
    }
    let path = child_path(parent, &name);
    if name != folder {
        relink(root, &Move::new(page, &path))?;
    }
    Ok(json!({ "path": path, "folder": name, "title": title }))
}

/// Move page `page` into page `parent`, keeping its folder name unless the
/// new parent already uses it. Its link line leaves the old parent and is
/// added at the end of the new one, and relative links follow the move.
/// Returns the page path, folder name, and title after the move.
pub fn move_page(root: &Path, page: &str, parent: &str) -> Result<Value, ProtocolError> {
    let source = own_folder(root, page, "moved")?;
    let (old_parent, folder) = split_path(page);
    if parent == page || parent.starts_with(&format!("{page}/")) {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            "A page cannot be moved into itself or one of its sub-pages.",
        ));
    }
    let target = page_dir(root, parent)?;
    let title = read_body(root, page)
        .ok()
        .and_then(|body| heading_title(without_bom(&body.content)))
        .unwrap_or_else(|| folder.to_string());
    if parent == old_parent {
        return Ok(json!({ "path": page, "folder": folder, "title": title }));
    }

    let name = unique_name(&target.dir, folder, None)?;
    let old_parent_body = read_body(root, old_parent)?;
    let new_parent_body = read_body(root, parent)?;
    fs::rename(&source, target.dir.join(&name)).map_err(|error| {
        ProtocolError::new(
            ErrorCode::Io,
            format!("Cannot move the page folder: {error}"),
        )
    })?;
    if let Some(next) = replace_link_lines(&old_parent_body.content, folder, None) {
        write_body(root, old_parent, &old_parent_body, &next)?;
    }
    let next = append_line(&new_parent_body.content, &link_line(&title, &name));
    write_body(root, parent, &new_parent_body, &next)?;
    let path = child_path(parent, &name);
    relink(root, &Move::new(page, &path))?;
    Ok(json!({ "path": path, "folder": name, "title": title }))
}

/// Delete page `page` with all its sub-pages and files, and remove its link
/// lines from the parent. Returns the deleted page's path.
pub fn delete_page(root: &Path, page: &str) -> Result<Value, ProtocolError> {
    let folder_path = own_folder(root, page, "deleted")?;
    let (parent, folder) = split_path(page);
    let parent_body = read_body(root, parent)?;
    fs::remove_dir_all(&folder_path).map_err(|error| {
        ProtocolError::new(ErrorCode::Io, format!("Cannot delete the page: {error}"))
    })?;
    if let Some(next) = replace_link_lines(&parent_body.content, folder, None) {
        write_body(root, parent, &parent_body, &next)?;
    }
    Ok(json!({ "path": page }))
}

/// The folder of page `page` as named in the notes folder (not resolved), for
/// an operation (`verb`) that the home page and linked folders refuse.
fn own_folder(root: &Path, page: &str, verb: &str) -> Result<PathBuf, ProtocolError> {
    if page.is_empty() {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            format!("The home page cannot be {verb}."),
        ));
    }
    page_dir(root, page)?;
    let folder = page
        .split('/')
        .fold(root.to_path_buf(), |dir, name| dir.join(name));
    let real = fs::symlink_metadata(&folder).is_ok_and(|metadata| metadata.is_dir());
    if !real {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            format!("\"{page}\" is a link to another folder, so it cannot be {verb}."),
        ));
    }
    Ok(folder)
}

/// The parent page path and folder name of page `page` (both empty for the root).
fn split_path(page: &str) -> (&str, &str) {
    match page.rfind('/') {
        Some(index) => (&page[..index], &page[index + 1..]),
        None => ("", page),
    }
}

/// The page path of folder `name` inside page `parent`.
fn child_path(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

/// True while folder name `folder` is the one a page titled `title` gets,
/// possibly with a number added to keep it unique (`Untitled 2`).
fn follows_title(folder: &str, title: &str) -> bool {
    let base = folder_name(title);
    folder == base
        || folder
            .strip_prefix(&format!("{base} "))
            .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
}

/// Replace page `page`'s body `body` with `next`, refusing if it changed meanwhile.
fn write_body(root: &Path, page: &str, body: &Body, next: &str) -> Result<(), ProtocolError> {
    write_page(root, page, next, body.hash.as_deref()).map(|_| ())
}

/// `text` without a leading byte order mark.
fn without_bom(text: &str) -> &str {
    text.strip_prefix('\u{feff}').unwrap_or(text)
}

/// The line ending `text` uses most, `\n` when it has none.
fn line_ending(text: &str) -> &'static str {
    let crlf = text.matches("\r\n").count();
    if crlf * 2 > text.matches('\n').count() {
        "\r\n"
    } else {
        "\n"
    }
}

/// The line ending of one line from `split_inclusive('\n')`.
fn ending_of(line: &str) -> &str {
    let content = line.trim_end_matches(['\r', '\n']);
    &line[content.len()..]
}

/// `text` with its title line set to `# <title>`, or with one added at the
/// top (after front matter) when it has none.
fn with_title(text: &str, title: &str) -> String {
    let body = without_bom(text);
    let bom = &text[..text.len() - body.len()];
    let mask = prose_mask(body);
    let lines: Vec<&str> = body.split_inclusive('\n').collect();
    let heading = format!("# {title}");
    let found = (0..lines.len()).find(|&index| {
        mask.get(index).copied().unwrap_or(false)
            && line_title(lines[index].trim_end_matches(['\r', '\n'])).is_some()
    });
    let mut out = String::with_capacity(text.len() + heading.len() + 2);
    out.push_str(bom);
    if let Some(found) = found {
        for (index, line) in lines.iter().enumerate() {
            if index == found {
                out.push_str(&heading);
                out.push_str(ending_of(line));
            } else {
                out.push_str(line);
            }
        }
        return out;
    }
    let front_matter = mask.first() == Some(&false)
        && lines.first().is_some_and(|line| line.trim_end() == "---");
    let after_front_matter = if front_matter {
        (1..lines.len())
            .find(|&index| matches!(lines[index].trim_end(), "---" | "..."))
            .map_or(0, |close| close + 1)
    } else {
        0
    };
    let eol = line_ending(body);
    for line in &lines[..after_front_matter] {
        out.push_str(line);
    }
    if !out.is_empty() && !out.ends_with('\n') && !out.ends_with('\u{feff}') {
        out.push_str(eol);
    }
    out.push_str(&heading);
    out.push_str(eol);
    for line in &lines[after_front_matter..] {
        out.push_str(line);
    }
    out
}

/// `text` with every link line to child folder `folder` replaced by `line`
/// (keeping its indentation and ending), or removed when `line` is None.
/// None when `text` has no such line.
fn replace_link_lines(text: &str, folder: &str, line: Option<&str>) -> Option<String> {
    let body = without_bom(text);
    let mask = prose_mask(body);
    let mut out = String::with_capacity(text.len());
    out.push_str(&text[..text.len() - body.len()]);
    let mut found = false;
    for (index, raw) in body.split_inclusive('\n').enumerate() {
        let content = raw.trim_end_matches(['\r', '\n']);
        let prose = mask.get(index).copied().unwrap_or(false);
        if prose && link_target_folder(content).as_deref() == Some(folder) {
            found = true;
            if let Some(line) = line {
                out.push_str(&content[..content.len() - content.trim_start().len()]);
                out.push_str(line);
                out.push_str(ending_of(raw));
            }
            continue;
        }
        out.push_str(raw);
    }
    found.then_some(out)
}

/// `text` with `line` added as its last line.
fn append_line(text: &str, line: &str) -> String {
    if text.is_empty() {
        return format!("{line}\n");
    }
    let eol = line_ending(text);
    let mut out = text.to_string();
    if !out.ends_with('\n') {
        out.push_str(eol);
    }
    out.push_str(line);
    out.push_str(eol);
    out
}

/// The link line for child folder `folder` titled `title`, in the same form
/// the app writes: brackets leave the title and the folder is
/// percent-encoded like `encodeURIComponent`, parentheses included.
fn link_line(title: &str, folder: &str) -> String {
    let label = title
        .replace(['[', ']', '\r', '\n'], " ")
        .split(' ')
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let label = if label.is_empty() {
        folder
    } else {
        label.as_str()
    };
    let mut target = String::with_capacity(folder.len());
    for byte in folder.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'".contains(&byte) {
            target.push(char::from(byte));
        } else {
            let _ = write!(target, "%{byte:02X}");
        }
    }
    format!("[{label}]({target}/{README})")
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

        let first = create_page(dir.path(), "Trips", "Untitled", true).unwrap();
        assert_eq!(first["path"], json!("Trips/Untitled 2"));
        assert_eq!(first["folder"], json!("Untitled 2"));
        let readme = trips.join("Untitled 2").join("README.md");
        assert_eq!(fs::read_to_string(readme).unwrap(), "# Untitled\n");
        assert_eq!(
            read(dir.path(), "Trips/README.md"),
            "[Untitled](Untitled%202/README.md)\n"
        );

        let top = create_page(dir.path(), "", "Ideas: 2027", false).unwrap();
        assert_eq!(top["path"], json!("Ideas 2027"));
        assert_eq!(top["title"], json!("Ideas: 2027"));
        assert!(!dir.path().join("README.md").exists());
    }

    #[test]
    fn refuses_parents_outside_the_notes_folder() {
        let dir = TestDir::new("pageops-outside");
        let error = create_page(dir.path(), "../elsewhere", "Page", false).unwrap_err();
        assert_eq!(error.code, ErrorCode::OutsideRoot);
        let missing = create_page(dir.path(), "Missing", "Page", false).unwrap_err();
        assert_eq!(missing.code, ErrorCode::NotFound);
    }

    /// Write `text` to `path` under `root`, creating its folders.
    fn write(root: &Path, path: &str, text: &str) {
        let file = root.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, text).unwrap();
    }

    /// The text of `path` under `root`.
    fn read(root: &Path, path: &str) -> String {
        fs::read_to_string(root.join(path)).unwrap()
    }

    #[test]
    fn edits_title_lines_and_link_lines_in_place() {
        assert_eq!(
            with_title("\u{feff}intro\r\n# Old\r\nbody", "New"),
            "\u{feff}intro\r\n# New\r\nbody"
        );
        assert_eq!(
            with_title("---\na: 1\n---\nbody\n", "T"),
            "---\na: 1\n---\n# T\nbody\n"
        );
        assert_eq!(with_title("", "T"), "# T\n");
        assert_eq!(
            with_title("```\n# not\n```\n", "T"),
            "# T\n```\n# not\n```\n"
        );

        let parent = "# P\r\n  [Old](Old%20one/README.md)\r\n[x](other/README.md)\r\n";
        assert_eq!(
            replace_link_lines(parent, "Old one", Some("[N](N/README.md)")).as_deref(),
            Some("# P\r\n  [N](N/README.md)\r\n[x](other/README.md)\r\n")
        );
        assert_eq!(
            replace_link_lines(parent, "Old one", None).as_deref(),
            Some("# P\r\n[x](other/README.md)\r\n")
        );
        assert_eq!(replace_link_lines(parent, "missing", None), None);
        assert_eq!(
            append_line("# P\r\nlast", "[a](a/README.md)"),
            "# P\r\nlast\r\n[a](a/README.md)\r\n"
        );
        assert_eq!(
            link_line("A [b] (c)", "Café (1)"),
            "[A b (c)](Caf%C3%A9%20%281%29/README.md)"
        );
    }

    #[test]
    fn renames_the_folder_only_while_it_follows_the_title() {
        let dir = TestDir::new("pageops-rename");
        let root = dir.path();
        write(
            root,
            "README.md",
            "# Home\n[Untitled](Untitled%202/README.md)\nsee [it](Untitled%202/Sub/README.md)\n",
        );
        write(
            root,
            "Untitled 2/README.md",
            "# Untitled\nup [home](../README.md)\n[Sub](Sub/README.md)\n",
        );
        write(
            root,
            "Untitled 2/Sub/README.md",
            "# Sub\n[back](../../README.md)\n",
        );

        let renamed = rename_page(root, "Untitled 2", "Trip: Japan").unwrap();
        assert_eq!(
            renamed,
            json!({ "path": "Trip Japan", "folder": "Trip Japan", "title": "Trip: Japan" })
        );
        assert_eq!(
            read(root, "README.md"),
            "# Home\n[Trip: Japan](Trip%20Japan/README.md)\nsee [it](Trip%20Japan/Sub/README.md)\n"
        );
        assert_eq!(
            read(root, "Trip Japan/README.md"),
            "# Trip: Japan\nup [home](../README.md)\n[Sub](Sub/README.md)\n"
        );
        assert_eq!(
            read(root, "Trip Japan/Sub/README.md"),
            "# Sub\n[back](../../README.md)\n"
        );

        write(root, "docs/README.md", "# Guide\n");
        let kept = rename_page(root, "docs", "Documentation").unwrap();
        assert_eq!(kept["path"], json!("docs"));
        assert_eq!(read(root, "docs/README.md"), "# Documentation\n");

        assert_eq!(rename_page(root, "", "Notes").unwrap()["path"], json!(""));
        let home = read(root, "README.md");
        assert!(home.starts_with("# Notes\n[Trip: Japan]"));
    }

    #[test]
    fn moves_a_page_with_its_links_and_never_into_itself() {
        let dir = TestDir::new("pageops-move");
        let root = dir.path();
        write(
            root,
            "README.md",
            "# Home\r\n[Trips](Trips/README.md)\r\nsee [Japan](Trips/Japan/README.md)\r\n",
        );
        write(
            root,
            "Trips/README.md",
            "# Trips\r\n[Japan](Japan/README.md)\r\n[Korea](Korea/README.md)\r\n",
        );
        write(
            root,
            "Trips/Japan/README.md",
            "# Japan\n[Korea](../Korea/README.md)\n",
        );
        fs::create_dir_all(root.join("Trips/Korea")).unwrap();
        fs::create_dir_all(root.join("Archive/Japan")).unwrap();

        let moved = move_page(root, "Trips/Japan", "Archive").unwrap();
        assert_eq!(
            moved,
            json!({ "path": "Archive/Japan 2", "folder": "Japan 2", "title": "Japan" })
        );
        assert_eq!(
            read(root, "Trips/README.md"),
            "# Trips\r\n[Korea](Korea/README.md)\r\n"
        );
        assert_eq!(
            read(root, "Archive/README.md"),
            "[Japan](Japan%202/README.md)\n"
        );
        assert_eq!(
            read(root, "Archive/Japan 2/README.md"),
            "# Japan\n[Korea](../../Trips/Korea/README.md)\n"
        );
        assert_eq!(
            read(root, "README.md"),
            "# Home\r\n[Trips](Trips/README.md)\r\nsee [Japan](Archive/Japan%202/README.md)\r\n"
        );

        let refused = [
            ("Archive", "Archive/Japan 2"),
            ("Archive", "Archive"),
            ("", "Archive"),
        ];
        for (page, parent) in refused {
            let error = move_page(root, page, parent).unwrap_err();
            assert_eq!(error.code, ErrorCode::BadRequest, "{page} into {parent}");
        }
    }

    #[test]
    fn deletes_a_page_with_its_sub_pages_and_link_line() {
        let dir = TestDir::new("pageops-delete");
        let root = dir.path();
        write(root, "README.md", "# Home\n[Old](Old/README.md)\nkeep\n");
        write(root, "Old/Sub/README.md", "# Sub\n");

        assert_eq!(delete_page(root, "Old").unwrap()["path"], json!("Old"));
        assert!(!root.join("Old").exists());
        assert_eq!(read(root, "README.md"), "# Home\nkeep\n");
        let home = delete_page(root, "").unwrap_err();
        assert_eq!(home.code, ErrorCode::BadRequest);
        let gone = delete_page(root, "Old").unwrap_err();
        assert_eq!(gone.code, ErrorCode::NotFound);
    }
}
