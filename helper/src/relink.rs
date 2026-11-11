//! Relative links after a page folder moves (see architecture.md, Page
//! structure): every `README.md` in the notes folder is scanned, and each
//! relative link whose target moved, or whose own page moved, is rewritten so
//! it still points at the same file. Links in code are left alone. The `src`
//! of an HTML `<img>` tag counts as a link, since sized and aligned images are
//! written that way.

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use crate::body::replace_file;
use crate::pages::{README, is_excluded, percent_decode, prose_mask};
use crate::protocol::{ErrorCode, ProtocolError};

/// Most `README.md` files scanned, matching the page tree's limit.
const MAX_FILES: usize = 5000;
/// Deepest folder nesting scanned, matching the page tree's limit.
const MAX_DEPTH: usize = 64;
/// Largest `README.md` rewritten.
const MAX_BYTES: u64 = 8 * 1024 * 1024;

/// A page folder move, as `/`-separated segments of the page path before and after.
pub struct Move {
    from: Vec<String>,
    to: Vec<String>,
}

impl Move {
    /// The move of page `from` to page path `to`; neither is the root.
    pub fn new(from: &str, to: &str) -> Self {
        Move {
            from: segments(from),
            to: segments(to),
        }
    }

    /// Where `path` is after the move.
    fn forward(&self, path: &[String]) -> Vec<String> {
        remap(path, &self.from, &self.to)
    }

    /// Where `path` was before the move.
    fn back(&self, path: &[String]) -> Vec<String> {
        remap(path, &self.to, &self.from)
    }
}

/// The non-empty segments of a `/`-separated path.
fn segments(path: &str) -> Vec<String> {
    path.split('/')
        .filter(|segment| !segment.is_empty())
        .map(String::from)
        .collect()
}

/// `path` with leading segments `from` replaced by `to`, or unchanged when it is not under `from`.
fn remap(path: &[String], from: &[String], to: &[String]) -> Vec<String> {
    match path.strip_prefix(from) {
        Some(rest) => to.iter().chain(rest).cloned().collect(),
        None => path.to_vec(),
    }
}

/// Rewrite the links that `change` broke in every `README.md` of the notes
/// folder at `root`. Returns how many files were rewritten.
pub fn relink(root: &Path, change: &Move) -> Result<usize, ProtocolError> {
    let mut rewritten = 0;
    for (dir, folder) in page_folders(root) {
        let file = dir.join(README);
        let Ok(metadata) = fs::symlink_metadata(&file) else {
            continue;
        };
        if !metadata.is_file() || metadata.len() > MAX_BYTES {
            continue;
        }
        let Ok(text) = fs::read_to_string(&file) else {
            continue;
        };
        if let Some(next) = rewrite_links(&text, &change.back(&folder), &folder, change) {
            replace_file(&file, next.as_bytes()).map_err(|error| {
                ProtocolError::new(
                    ErrorCode::Io,
                    format!("Cannot update the links in {}: {error}", file.display()),
                )
            })?;
            rewritten += 1;
        }
    }
    Ok(rewritten)
}

/// Every folder that can hold a page, with its page path as segments. Dot
/// folders, `assets`, and symbolic links are skipped.
fn page_folders(root: &Path) -> Vec<(PathBuf, Vec<String>)> {
    let mut found = Vec::new();
    let mut stack = vec![(root.to_path_buf(), Vec::new())];
    while let Some((dir, path)) = stack.pop() {
        if found.len() >= MAX_FILES {
            break;
        }
        let reader = if path.len() < MAX_DEPTH {
            fs::read_dir(&dir).ok()
        } else {
            None
        };
        if let Some(reader) = reader {
            for entry in reader.filter_map(Result::ok) {
                let is_dir = entry.file_type().is_ok_and(|kind| kind.is_dir());
                let Ok(name) = entry.file_name().into_string() else {
                    continue;
                };
                if is_dir && !is_excluded(&name) {
                    let mut child: Vec<String> = path.clone();
                    child.push(name);
                    stack.push((entry.path(), child));
                }
            }
        }
        found.push((dir, path));
    }
    found
}

/// `text` of the page that was at `old_dir` and is now at `new_dir`, with its
/// relative links rewritten for `change`, or None when no link changes.
pub fn rewrite_links(
    text: &str,
    old_dir: &[String],
    new_dir: &[String],
    change: &Move,
) -> Option<String> {
    let (bom, body) = match text.strip_prefix('\u{feff}') {
        Some(rest) => ("\u{feff}", rest),
        None => ("", text),
    };
    let mask = prose_mask(body);
    let mut out = String::with_capacity(text.len());
    out.push_str(bom);
    let mut changed = false;
    for (index, line) in body.split_inclusive('\n').enumerate() {
        let prose = mask.get(index).copied().unwrap_or(false);
        match prose.then(|| rewrite_line(line, old_dir, new_dir, change)) {
            Some(Some(next)) => {
                out.push_str(&next);
                changed = true;
            }
            _ => out.push_str(line),
        }
    }
    changed.then_some(out)
}

/// How a link destination is written.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Form {
    /// A Markdown destination without angle brackets.
    Bare,
    /// A Markdown destination in angle brackets (the span excludes them).
    Angle,
    /// The quoted value of an HTML `src` attribute (the span excludes the quotes).
    Html,
}

/// One link destination inside a line: its byte range and how it is written.
struct Span {
    start: usize,
    end: usize,
    form: Form,
}

/// `line` with its relative link destinations rewritten, or None when none changes.
fn rewrite_line(
    line: &str,
    old_dir: &[String],
    new_dir: &[String],
    change: &Move,
) -> Option<String> {
    let mut out = String::with_capacity(line.len());
    let mut last = 0;
    for span in link_targets(line) {
        let raw = &line[span.start..span.end];
        if let Some(next) = retarget(raw, span.form, old_dir, new_dir, change) {
            out.push_str(&line[last..span.start]);
            out.push_str(&next);
            last = span.end;
        }
    }
    if last == 0 {
        return None;
    }
    out.push_str(&line[last..]);
    Some(out)
}

/// The link destinations in `line`: those of inline links, images, and HTML
/// image sources outside code spans, in order, or of a link reference definition.
fn link_targets(line: &str) -> Vec<Span> {
    let indent = line.len() - line.trim_start_matches(' ').len();
    let definition = if indent <= 3 && line[indent..].starts_with('[') {
        line[indent..].find("]:")
    } else {
        None
    };
    if let Some(close) = definition {
        let label = &line[indent + 1..indent + close];
        if !label.is_empty() && !label.contains(['[', ']']) {
            let after = indent + close + 2;
            let start = line.len() - line[after..].trim_start_matches([' ', '\t']).len();
            return destination(line, start).into_iter().collect();
        }
    }

    let code = code_spans(line);
    let mut spans = Vec::new();
    let mut from = 0;
    while let Some(found) = line[from..].find("](") {
        let at = from + found;
        from = at + 2;
        if code.iter().any(|&(start, end)| at >= start && at < end) {
            continue;
        }
        let start = line.len() - line[from..].trim_start_matches([' ', '\t']).len();
        if let Some(span) = destination(line, start) {
            from = span.end;
            spans.push(span);
        }
    }
    spans.extend(image_sources(line, &code));
    spans.sort_by_key(|span| span.start);
    let mut ordered: Vec<Span> = Vec::with_capacity(spans.len());
    for span in spans {
        if ordered.last().is_none_or(|last| span.start >= last.end) {
            ordered.push(span);
        }
    }
    ordered
}

/// The quoted `src` values of the `<img>` tags in `line` that start outside
/// the code spans `code`.
fn image_sources(line: &str, code: &[(usize, usize)]) -> Vec<Span> {
    let bytes = line.as_bytes();
    let mut spans = Vec::new();
    let mut from = 0;
    while let Some(found) = line[from..].to_ascii_lowercase().find("<img") {
        let tag = from + found;
        from = tag + 4;
        let boundary = |b: u8| b.is_ascii_whitespace() || b == b'/' || b == b'>';
        let ends_name = bytes.get(from).copied().is_none_or(boundary);
        if !ends_name || code.iter().any(|&(start, end)| tag >= start && tag < end) {
            continue;
        }
        let mut at = from;
        while let Some(attribute) = next_attribute(bytes, at) {
            at = attribute.next;
            if attribute.name.eq_ignore_ascii_case(b"src") {
                if let Some((start, end)) = attribute.value {
                    spans.push(Span {
                        start,
                        end,
                        form: Form::Html,
                    });
                }
                break;
            }
        }
        from = at.max(from);
    }
    spans
}

/// One attribute of an HTML tag: its name, the byte range of its quoted
/// value, if it has one, and where the next attribute may start.
struct Attribute<'a> {
    name: &'a [u8],
    value: Option<(usize, usize)>,
    next: usize,
}

/// The attribute starting at or after byte `at` of a tag in `bytes`, or None
/// at the end of the tag or the line.
fn next_attribute(bytes: &[u8], at: usize) -> Option<Attribute<'_>> {
    let skip = |mut index: usize| {
        while bytes.get(index).is_some_and(u8::is_ascii_whitespace) {
            index += 1;
        }
        index
    };
    let start = skip(at);
    let is_name =
        |b: &u8| !b.is_ascii_whitespace() && !matches!(*b, b'=' | b'>' | b'/' | b'"' | b'\'');
    let mut end = start;
    while bytes.get(end).is_some_and(is_name) {
        end += 1;
    }
    if end == start {
        return None;
    }
    let name = &bytes[start..end];
    let equals = skip(end);
    if bytes.get(equals) != Some(&b'=') {
        return Some(Attribute {
            name,
            value: None,
            next: end,
        });
    }
    let open = skip(equals + 1);
    match bytes.get(open) {
        Some(&quote) if quote == b'"' || quote == b'\'' => {
            let close = bytes[open + 1..].iter().position(|&b| b == quote)? + open + 1;
            Some(Attribute {
                name,
                value: Some((open + 1, close)),
                next: close + 1,
            })
        }
        _ => {
            let stops = |b: &u8| b.is_ascii_whitespace() || *b == b'>';
            let mut close = open;
            while bytes.get(close).is_some_and(|b| !stops(b)) {
                close += 1;
            }
            Some(Attribute {
                name,
                value: None,
                next: close,
            })
        }
    }
}

/// The link destination starting at byte `start` of `line`: `<...>`, or a run
/// without spaces whose parentheses balance.
fn destination(line: &str, start: usize) -> Option<Span> {
    let rest = &line[start..];
    if let Some(inner) = rest.strip_prefix('<') {
        let end = inner.find(['>', '<', '\r', '\n'])?;
        if !inner[end..].starts_with('>') {
            return None;
        }
        return Some(Span {
            start: start + 1,
            end: start + 1 + end,
            form: Form::Angle,
        });
    }
    let mut depth = 0usize;
    let mut escaped = false;
    let mut end = rest.len();
    for (index, c) in rest.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        match c {
            '\\' => escaped = true,
            '(' => depth += 1,
            ')' if depth == 0 => {
                end = index;
                break;
            }
            ')' => depth -= 1,
            c if c.is_whitespace() || c.is_control() => {
                end = index;
                break;
            }
            _ => {}
        }
    }
    if end == 0 {
        return None;
    }
    Some(Span {
        start,
        end: start + end,
        form: Form::Bare,
    })
}

/// Byte ranges of the inline code spans in `line`: a backtick run up to the
/// next run of the same length.
fn code_spans(line: &str) -> Vec<(usize, usize)> {
    let bytes = line.as_bytes();
    let run_at = |from: usize| bytes[from..].iter().take_while(|&&b| b == b'`').count();
    let mut spans = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'`' {
            index += 1;
            continue;
        }
        let open = run_at(index);
        let mut next = index + open;
        let mut close = None;
        while next < bytes.len() {
            if bytes[next] == b'`' {
                let run = run_at(next);
                if run == open {
                    close = Some(next + run);
                    break;
                }
                next += run;
            } else {
                next += 1;
            }
        }
        match close {
            Some(end) => {
                spans.push((index, end));
                index = end;
            }
            None => index += open,
        }
    }
    spans
}

/// The new form of destination `raw`, written as `form`, in a page that moved
/// from `old_dir` to `new_dir`, or None when it still points at the right
/// place or is not a relative link inside the notes folder.
fn retarget(
    raw: &str,
    form: Form,
    old_dir: &[String],
    new_dir: &[String],
    change: &Move,
) -> Option<String> {
    let raw = if form == Form::Html {
        decode_entities(raw)
    } else {
        raw.to_string()
    };
    if raw.is_empty() || raw.starts_with(['#', '?', '/', '\\']) || has_scheme(&raw) {
        return None;
    }
    let cut = raw.find(['#', '?']).unwrap_or(raw.len());
    let (path, suffix) = raw.split_at(cut);
    let decoded = if form == Form::Html {
        percent_decode(path)?
    } else {
        percent_decode(&unescape(path))?
    };
    let target = resolve(old_dir, &decoded)?;
    let before = relative(old_dir, &target);
    let after = relative(new_dir, &change.forward(&target));
    if before == after {
        return None;
    }
    let slash = if decoded.ends_with('/') { "/" } else { "" };
    let angle = form == Form::Angle;
    let next = format!("{}{slash}{suffix}", encode_path(&after, angle));
    Some(if form == Form::Html {
        escape_attribute(&next)
    } else {
        next
    })
}

/// `value` with the character references HTML attribute values commonly use
/// decoded: `&amp;`, `&quot;`, `&#39;`, `&apos;`, `&lt;`, and `&gt;`.
fn decode_entities(value: &str) -> String {
    const ENTITIES: [(&str, char); 6] = [
        ("&amp;", '&'),
        ("&quot;", '"'),
        ("&#39;", '\''),
        ("&apos;", '\''),
        ("&lt;", '<'),
        ("&gt;", '>'),
    ];
    let mut out = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        let mut entity = None;
        for (name, c) in ENTITIES {
            let head = rest.get(..name.len()).unwrap_or_default();
            if head.eq_ignore_ascii_case(name) {
                entity = Some((name, c));
                break;
            }
        }
        match entity {
            Some((name, c)) => {
                out.push(c);
                rest = &rest[name.len()..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// `value` escaped for a quoted HTML attribute.
fn escape_attribute(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// True when `raw` starts with a URL scheme such as `https:` or `mailto:`.
fn has_scheme(raw: &str) -> bool {
    let Some(colon) = raw.find(':') else {
        return false;
    };
    let scheme = &raw[..colon];
    scheme.starts_with(|c: char| c.is_ascii_alphabetic())
        && scheme
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
}

/// `value` with Markdown backslash escapes of punctuation removed.
fn unescape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' && chars.peek().is_some_and(char::is_ascii_punctuation) {
            continue;
        }
        out.push(c);
    }
    out
}

/// The segments of relative path `path` resolved from folder `base`, or None
/// when it climbs out of the notes folder.
fn resolve(base: &[String], path: &str) -> Option<Vec<String>> {
    let mut resolved = base.to_vec();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                resolved.pop()?;
            }
            name => resolved.push(name.to_string()),
        }
    }
    Some(resolved)
}

/// The relative path from folder `from` to `to`, `/`-separated.
fn relative(from: &[String], to: &[String]) -> String {
    let common = from.iter().zip(to).take_while(|(a, b)| a == b).count();
    let parts: Vec<&str> = std::iter::repeat_n("..", from.len() - common)
        .chain(to[common..].iter().map(String::as_str))
        .collect();
    if parts.is_empty() {
        ".".to_string()
    } else {
        parts.join("/")
    }
}

/// `path` percent-encoded where a link destination needs it: `%`, `#`, `?`,
/// backslashes, angle brackets, and control characters, plus spaces and
/// parentheses outside angle brackets.
fn encode_path(path: &str, angle: bool) -> String {
    let mut out = String::with_capacity(path.len());
    for c in path.chars() {
        let escape = c.is_control()
            || matches!(c, '%' | '#' | '?' | '\\' | '<' | '>')
            || (!angle && (c.is_whitespace() || c == '(' || c == ')'));
        if escape {
            let mut buffer = [0u8; 4];
            for byte in c.encode_utf8(&mut buffer).bytes() {
                let _ = write!(out, "%{byte:02X}");
            }
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Rewrite `text` of the page at `old` (now at `new`) for a move of `from` to `to`.
    fn rewrite(text: &str, old: &str, new: &str, from: &str, to: &str) -> Option<String> {
        rewrite_links(text, &segments(old), &segments(new), &Move::new(from, to))
    }

    #[test]
    fn points_links_into_a_moved_page_at_its_new_place() {
        let text = "[J](Trips/Japan/README.md) ![map](Trips/Japan/assets/map.png#x)\r\n";
        assert_eq!(
            rewrite(text, "", "", "Trips/Japan", "Japan 2027").as_deref(),
            Some("[J](Japan%202027/README.md) ![map](Japan%202027/assets/map.png#x)\r\n")
        );
        let angle = "[J](<Trips/Japan/README.md>)\n[ref]: ./Trips/Japan/README.md \"T\"\n";
        assert_eq!(
            rewrite(angle, "", "", "Trips/Japan", "Japan 2027").as_deref(),
            Some("[J](<Japan 2027/README.md>)\n[ref]: Japan%202027/README.md \"T\"\n")
        );
    }

    #[test]
    fn keeps_a_moved_page_pointing_at_the_same_files() {
        let text = "[home](../../README.md) [k](../Korea/README.md) [c](Kyoto/README.md)\n";
        assert_eq!(
            rewrite(text, "Trips/Japan", "Japan", "Trips/Japan", "Japan").as_deref(),
            Some("[home](../README.md) [k](../Trips/Korea/README.md) [c](Kyoto/README.md)\n")
        );
    }

    #[test]
    fn leaves_code_external_links_and_other_pages_alone() {
        let text = "`[x](Trips/Japan/README.md)` [w](https://a.b/Trips/Japan) [a](#top)\n\
                    ```\n[x](Trips/Japan/README.md)\n```\n[o](Trips/Korea/README.md) [u](../x)\n";
        assert_eq!(rewrite(text, "", "", "Trips/Japan", "Japan"), None);
    }

    #[test]
    fn rewrites_the_source_of_html_images() {
        let text = concat!(
            "<p align=\"center\"><img src=\"Trips/R&amp;D/assets/a.png\" alt=\"Trips/R&amp;D\">",
            "</p>\n<IMG ALT='x' SRC='Trips/R&amp;D/b.png#k'> ",
            "`<img src=\"Trips/R&amp;D/c.png\">`\n",
        );
        let moved = concat!(
            "<p align=\"center\"><img src=\"R&amp;D%202/assets/a.png\" alt=\"Trips/R&amp;D\">",
            "</p>\n<IMG ALT='x' SRC='R&amp;D%202/b.png#k'> ",
            "`<img src=\"Trips/R&amp;D/c.png\">`\n",
        );
        assert_eq!(
            rewrite(text, "", "", "Trips/R&D", "R&D 2").as_deref(),
            Some(moved)
        );
        let other = "<image src=\"Trips/R&amp;D/a.png\"> <img data-src=\"Trips/R&amp;D/a.png\">\n";
        assert_eq!(rewrite(other, "", "", "Trips/R&D", "R&D 2"), None);
    }

    #[test]
    fn decodes_escapes_and_keeps_a_byte_order_mark() {
        let text = "\u{feff}[a](Caf%C3%A9\\(1\\)/README.md)\n";
        assert_eq!(
            rewrite(text, "", "", "Café(1)", "Food/Café(1)").as_deref(),
            Some("\u{feff}[a](Food/Café%281%29/README.md)\n")
        );
    }
}
