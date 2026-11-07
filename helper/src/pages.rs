//! Page tree: every page is a folder whose body is its `README.md`. Titles come
//! from the first `# ` heading, and link lines `[Title](child/README.md)` set
//! the order of sub-pages.

use std::fs;
use std::path::Path;

use serde_json::{Value, json};

use crate::dirs::{compare_names, has_hidden_attribute};
use crate::protocol::ProtocolError;

/// The file that holds a page's body.
pub const README: &str = "README.md";

/// Most pages returned in one tree, keeping the reply well under the 1 MiB message limit.
const MAX_PAGES: usize = 5000;

/// Deepest folder nesting scanned, guarding against pathological trees.
const MAX_DEPTH: usize = 64;

/// Largest `README.md` read for its title and links.
const MAX_README_BYTES: u64 = 8 * 1024 * 1024;

/// Page budget shared by one scan.
struct Scan {
    remaining: usize,
    truncated: bool,
}

/// Build the page tree of a notes folder.
pub fn page_tree(root: &Path) -> Result<Value, ProtocolError> {
    let name = root
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.to_string_lossy().into_owned());
    let mut scan = Scan {
        remaining: MAX_PAGES - 1,
        truncated: false,
    };
    let tree = page(root, "", &name, 0, &mut scan);
    Ok(json!({ "root": tree, "truncated": scan.truncated }))
}

/// Describe one page folder and, recursively, its sub-pages.
fn page(dir: &Path, path: &str, name: &str, depth: usize, scan: &mut Scan) -> Value {
    let body = read_readme(dir);
    let (title, links) = match &body {
        Some(text) => (heading_title(text), linked_folders(text)),
        None => (None, Vec::new()),
    };

    let mut children = Vec::new();
    if depth < MAX_DEPTH {
        for child in ordered_children(child_page_names(dir), &links) {
            if scan.remaining == 0 {
                scan.truncated = true;
                break;
            }
            scan.remaining -= 1;
            let child_path = if path.is_empty() {
                child.clone()
            } else {
                format!("{path}/{child}")
            };
            let node = page(&dir.join(&child), &child_path, &child, depth + 1, scan);
            children.push(node);
        }
    } else if !child_page_names(dir).is_empty() {
        scan.truncated = true;
    }

    json!({
        "path": path,
        "name": name,
        "title": title.unwrap_or_else(|| name.to_string()),
        "hasReadme": body.is_some(),
        "children": children,
    })
}

/// Linked folders first, in link order, then the rest by name.
fn ordered_children(mut names: Vec<String>, links: &[String]) -> Vec<String> {
    let mut ordered = Vec::with_capacity(names.len());
    for link in links {
        if let Some(index) = names.iter().position(|name| name == link) {
            ordered.push(names.remove(index));
        }
    }
    names.sort_by(|a, b| compare_names(a, b));
    ordered.extend(names);
    ordered
}

/// True for folder names that can never be pages.
fn is_excluded(name: &str) -> bool {
    name.starts_with('.') || name == "assets"
}

/// Names of the subfolders of `dir` that are pages. Symbolic links are not followed.
fn child_page_names(dir: &Path) -> Vec<String> {
    let Ok(reader) = fs::read_dir(dir) else {
        return Vec::new();
    };
    reader
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
        .filter(|entry| !has_hidden_attribute(entry))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| !is_excluded(name))
        .collect()
}

/// Read a folder's `README.md`, or None when it is missing, not a file, or too large.
fn read_readme(dir: &Path) -> Option<String> {
    let file = dir.join(README);
    let metadata = fs::metadata(&file).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_README_BYTES {
        return None;
    }
    let bytes = fs::read(&file).ok()?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    match text.strip_prefix('\u{feff}') {
        Some(rest) => Some(rest.to_string()),
        None => Some(text),
    }
}

/// Lines of a Markdown body that are ordinary text: not front matter and not inside a code fence.
fn prose_lines(text: &str) -> impl Iterator<Item = &str> {
    let mut lines = text.lines().peekable();
    if lines.peek().is_some_and(|line| line.trim_end() == "---") {
        let mut front_matter = text.lines();
        front_matter.next();
        let closed = front_matter.any(|line| matches!(line.trim_end(), "---" | "..."));
        if closed {
            lines.next();
            for line in lines.by_ref() {
                if matches!(line.trim_end(), "---" | "...") {
                    break;
                }
            }
        }
    }

    let mut fence: Option<(char, usize)> = None;
    lines.filter(move |line| {
        let trimmed = line.trim_start();
        match fence {
            Some((marker, length)) => {
                let run = trimmed.chars().take_while(|&c| c == marker).count();
                if run >= length && trimmed[run * marker.len_utf8()..].trim().is_empty() {
                    fence = None;
                }
                false
            }
            None => {
                let marker = trimmed.chars().next().unwrap_or(' ');
                let run = trimmed.chars().take_while(|&c| c == marker).count();
                if (marker == '`' || marker == '~') && run >= 3 {
                    fence = Some((marker, run));
                    false
                } else {
                    true
                }
            }
        }
    })
}

/// The text of the first `# ` heading, without a closing `#` sequence.
pub fn heading_title(text: &str) -> Option<String> {
    prose_lines(text).find_map(|line| {
        let heading = line.strip_prefix("# ")?.trim();
        let open = heading.trim_end_matches('#');
        let title = if open.is_empty() || open.ends_with(' ') {
            open.trim_end()
        } else {
            heading
        };
        (!title.is_empty()).then(|| title.to_string())
    })
}

/// Folder names linked as sub-pages by whole lines of the form `[Title](folder/README.md)`.
pub fn linked_folders(text: &str) -> Vec<String> {
    prose_lines(text).filter_map(link_target_folder).collect()
}

/// The folder a sub-page link line points at, if the line is one.
fn link_target_folder(line: &str) -> Option<String> {
    let line = line.trim();
    if !line.starts_with('[') || !line.ends_with(')') {
        return None;
    }
    let split = line.rfind("](")?;
    let mut target = &line[split + 2..line.len() - 1];
    if let Some(inner) = target.strip_prefix('<').and_then(|t| t.strip_suffix('>')) {
        target = inner;
    }
    let target = target.strip_prefix("./").unwrap_or(target);
    let folder = target.strip_suffix("/README.md")?;
    let folder = percent_decode(folder)?;
    if folder.is_empty() || folder.contains(['/', '\\']) || is_excluded(&folder) {
        return None;
    }
    Some(folder)
}

/// Decode `%XX` escapes; None when the result is not UTF-8 or an escape is malformed.
fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = value.get(index + 1..index + 3)?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
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

    /// Titles of a node's children.
    fn child_titles(node: &Value) -> Vec<&str> {
        node["children"]
            .as_array()
            .unwrap()
            .iter()
            .map(|child| child["title"].as_str().unwrap())
            .collect()
    }

    #[test]
    fn titles_come_from_the_first_level_one_heading() {
        assert_eq!(heading_title("# Trips\n\ntext"), Some("Trips".into()));
        assert_eq!(heading_title("intro\n## Sub\n# Real"), Some("Real".into()));
        assert_eq!(heading_title("# Closed ##"), Some("Closed".into()));
        assert_eq!(heading_title("# C#"), Some("C#".into()));
        assert_eq!(heading_title("#NoSpace\n#   \n"), None);
        assert_eq!(
            heading_title("```bash\n# comment\n```\n# Books"),
            Some("Books".into())
        );
        assert_eq!(
            heading_title("---\n# yaml comment\ntags: [a]\n---\n# After"),
            Some("After".into())
        );
        assert_eq!(
            heading_title("---\n# Not front matter"),
            Some("Not front matter".into())
        );
    }

    #[test]
    fn link_lines_name_child_folders() {
        let text = "# Home\n[Trips](Trips/README.md)\n  [Japan](<Japan 2027/README.md>)  \n\
                    [Rome](./Rome%20Trip/README.md)\nSee [x](Other/README.md) inline\n\
                    [Deep](a/b/README.md)\n[Assets](assets/README.md)\n[File](notes.md)\n\
                    ~~~\n[Code](Code/README.md)\n~~~\n";
        assert_eq!(
            linked_folders(text),
            vec!["Trips", "Japan 2027", "Rome Trip"]
        );
    }

    #[test]
    fn builds_the_tree_in_link_order_then_by_name() {
        let dir = TestDir::new("pages");
        let root = dir.path();
        write(
            root,
            "README.md",
            "# Home\n\n[Trips](Trips/README.md)\n[Recipes](Recipes/README.md)\n",
        );
        write(
            root,
            "Trips/README.md",
            "# My trips\n[Japan](Japan%202027/README.md)\n",
        );
        write(root, "Trips/Japan 2027/README.md", "# Japan 2027\n");
        write(root, "Trips/Berlin/README.md", "no heading\n");
        write(root, "Recipes/README.md", "# Recipes\n");
        write(
            root,
            "books/README.md",
            "```\n# not a title\n```\n# Books\n",
        );
        fs::create_dir_all(root.join("Archive")).unwrap();
        fs::create_dir_all(root.join("assets")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        write(root, "loose.md", "# Not a page\n");

        let tree = page_tree(root).unwrap();
        let home = &tree["root"];
        assert_eq!(tree["truncated"], json!(false));
        assert_eq!(home["path"], json!(""));
        assert_eq!(home["title"], json!("Home"));
        assert_eq!(
            child_titles(home),
            vec!["My trips", "Recipes", "Archive", "Books"]
        );

        let trips = &home["children"][0];
        assert_eq!(trips["path"], json!("Trips"));
        assert_eq!(child_titles(trips), vec!["Japan 2027", "Berlin"]);
        assert_eq!(trips["children"][0]["path"], json!("Trips/Japan 2027"));
        assert_eq!(trips["children"][1]["hasReadme"], json!(true));

        let archive = &home["children"][2];
        assert_eq!(archive["hasReadme"], json!(false));
        assert_eq!(archive["name"], json!("Archive"));
    }

    #[test]
    fn root_without_readme_is_titled_by_its_folder() {
        let dir = TestDir::new("pages-empty");
        let tree = page_tree(dir.path()).unwrap();
        assert_eq!(
            tree["root"]["title"],
            json!(dir.path().file_name().unwrap().to_string_lossy())
        );
        assert_eq!(tree["root"]["hasReadme"], json!(false));
        assert_eq!(tree["root"]["children"], json!([]));
    }

    #[test]
    fn large_trees_are_truncated() {
        let dir = TestDir::new("pages-many");
        for index in 0..MAX_PAGES + 5 {
            fs::create_dir(dir.path().join(format!("p{index:05}"))).unwrap();
        }
        let tree = page_tree(dir.path()).unwrap();
        assert_eq!(tree["truncated"], json!(true));
        assert_eq!(
            tree["root"]["children"].as_array().unwrap().len(),
            MAX_PAGES - 1
        );
    }
}
