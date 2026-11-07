//! Page search (see architecture.md, Search): every page's title and body are
//! matched against the words of a query without regard to case, and the best
//! matches come back with a snippet around the first match in the body.

use std::cmp::Ordering;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

use serde_json::{Value, json};

use crate::pages::{
    MAX_DEPTH, MAX_PAGES, child_page_names, heading_title, line_title, prose_mask, read_readme,
};
use crate::protocol::ProtocolError;

/// Most results in one reply.
pub const MAX_RESULTS: usize = 50;
/// Most query words used.
const MAX_WORDS: usize = 8;
/// Characters of context kept before the first match in a snippet.
const LEAD_CHARS: usize = 60;
/// Longest snippet, in characters, before the ellipses.
const SNIPPET_CHARS: usize = 160;
/// List and to-do markers dropped from the start of a snippet.
const MARKERS: [&str; 6] = ["- ", "* ", "+ ", "[ ] ", "[x] ", "[X] "];

/// One matching page.
struct Hit {
    path: String,
    title: String,
    snippet: String,
    score: usize,
}

/// The words of a query, lowercased, at most eight.
fn query_words(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .take(MAX_WORDS)
        .map(str::to_lowercase)
        .collect()
}

/// Search the notes folder at `root` for pages whose title or body contains
/// every word of `query`. Answers `{ results, truncated }`, where each result
/// is `{ path, title, snippet }`, best first. Stops early with `superseded`
/// set once `latest` no longer equals `generation`, because a newer search
/// started.
pub fn search(
    root: &Path,
    query: &str,
    latest: &AtomicU64,
    generation: u64,
) -> Result<Value, ProtocolError> {
    let words = query_words(query);
    let mut hits = Vec::new();
    if !words.is_empty() {
        let root_name = root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let mut stack = vec![(root.to_path_buf(), String::new(), root_name, 0)];
        let mut visited = 0;
        while let Some((dir, path, name, depth)) = stack.pop() {
            if latest.load(AtomicOrdering::Relaxed) != generation {
                return Ok(json!({ "results": [], "truncated": false, "superseded": true }));
            }
            visited += 1;
            if let Some(hit) = match_page(&dir, &path, &name, &words) {
                hits.push(hit);
            }
            if depth >= MAX_DEPTH {
                continue;
            }
            for child in child_page_names(&dir) {
                if visited + stack.len() >= MAX_PAGES {
                    break;
                }
                let child_path = if path.is_empty() {
                    child.clone()
                } else {
                    format!("{path}/{child}")
                };
                stack.push((dir.join(&child), child_path, child, depth + 1));
            }
        }
    }
    let truncated = hits.len() > MAX_RESULTS;
    hits.sort_by(rank);
    hits.truncate(MAX_RESULTS);
    let results: Vec<Value> = hits
        .into_iter()
        .map(|hit| json!({ "path": hit.path, "title": hit.title, "snippet": hit.snippet }))
        .collect();
    Ok(json!({ "results": results, "truncated": truncated }))
}

/// Better hits first: a higher score, then by title and path.
fn rank(a: &Hit, b: &Hit) -> Ordering {
    let by_score = b.score.cmp(&a.score);
    let by_title = a.title.to_lowercase().cmp(&b.title.to_lowercase());
    by_score.then(by_title).then_with(|| a.path.cmp(&b.path))
}

/// Match the page in folder `dir` against `words`: every word must be in its
/// title or its body. Title matches score highest, then the number of body
/// matches, up to five per word.
fn match_page(dir: &Path, path: &str, name: &str, words: &[String]) -> Option<Hit> {
    let body = read_readme(dir).unwrap_or_default();
    let title = heading_title(&body).unwrap_or_else(|| name.to_string());
    let title_lower = title.to_lowercase();
    let lines = body_lines(&body);
    let lowered: Vec<String> = lines.iter().map(|line| line.to_lowercase()).collect();
    let mut score = 0;
    for word in words {
        let in_title = title_lower.contains(word.as_str());
        let count: usize = lowered
            .iter()
            .map(|line| line.matches(word.as_str()).count())
            .sum();
        if !in_title && count == 0 {
            return None;
        }
        if in_title {
            score += if title_lower.starts_with(word.as_str()) {
                15
            } else {
                10
            };
        }
        score += count.min(5);
    }
    let snippet = snippet_of(&lines, &lowered, words);
    Some(Hit {
        path: path.to_string(),
        title,
        snippet,
        score,
    })
}

/// The non-blank lines of a page body, except its title line.
fn body_lines(body: &str) -> Vec<&str> {
    let lines: Vec<&str> = body.lines().collect();
    let mask = prose_mask(body);
    let title = (0..lines.len())
        .find(|&index| mask.get(index) == Some(&true) && line_title(lines[index]).is_some());
    (0..lines.len())
        .filter(|&index| Some(index) != title && !lines[index].trim().is_empty())
        .map(|index| lines[index])
        .collect()
}

/// The index of the first of `lowered` (lowercased lines) that contains `word`.
fn line_with(lowered: &[String], word: &str) -> Option<usize> {
    lowered.iter().position(|line| line.contains(word))
}

/// A snippet of the first of `lines` that contains one of `words`, trying
/// the words in order, or of the first line when none does (`lowered` holds
/// the lines lowercased). Markdown markers at its start are dropped, and a
/// long line is cut around the match, with an ellipsis where it was cut.
fn snippet_of(lines: &[&str], lowered: &[String], words: &[String]) -> String {
    let (index, word) = words
        .iter()
        .find_map(|word| Some((line_with(lowered, word)?, word.as_str())))
        .unwrap_or((0, ""));
    let Some(line) = lines.get(index) else {
        return String::new();
    };
    let line = strip_markers(line);
    let chars: Vec<char> = line.chars().collect();
    let lower: Vec<char> = line.to_lowercase().chars().collect();
    let target: Vec<char> = word.chars().collect();
    let found = if target.is_empty() || lower.len() != chars.len() {
        None
    } else {
        lower
            .windows(target.len())
            .position(|window| window == target.as_slice())
    };
    let start = found.unwrap_or(0).saturating_sub(LEAD_CHARS);
    let end = (start + SNIPPET_CHARS).min(chars.len());
    let mut text: String = chars[start..end].iter().collect();
    if start > 0 {
        text.insert(0, '…');
    }
    if end < chars.len() {
        text.push('…');
    }
    text
}

/// `line` without leading indentation and Markdown block markers.
fn strip_markers(line: &str) -> &str {
    let mut text = line.trim_start();
    loop {
        let Some(rest) = marker_rest(text) else {
            return text;
        };
        text = rest.trim_start();
    }
}

/// The text after one Markdown block marker at the start of `text`: a
/// heading's `#`s, a quote's `>`, a list or to-do marker, or a number.
fn marker_rest(text: &str) -> Option<&str> {
    let hashes = text.trim_start_matches('#');
    if hashes.len() < text.len() && hashes.starts_with(' ') {
        return Some(hashes);
    }
    if let Some(rest) = text.strip_prefix('>') {
        return Some(rest);
    }
    if let Some(rest) = MARKERS.iter().find_map(|marker| text.strip_prefix(*marker)) {
        return Some(rest);
    }
    let digits = text.trim_start_matches(|c: char| c.is_ascii_digit());
    if digits.len() == text.len() {
        return None;
    }
    digits
        .strip_prefix(". ")
        .or_else(|| digits.strip_prefix(") "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    /// Write a page body below the notes folder.
    fn page(root: &Path, path: &str, body: &str) {
        let dir = root.join(path);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("README.md"), body).unwrap();
    }

    /// An expected result: a page path and its snippet.
    fn hit(path: &str, snippet: &str) -> (String, String) {
        (path.to_string(), snippet.to_string())
    }

    /// The paths and snippets of a search's results.
    fn found(root: &Path, query: &str) -> Vec<(String, String)> {
        let reply = search(root, query, &AtomicU64::new(1), 1).unwrap();
        reply["results"]
            .as_array()
            .unwrap()
            .iter()
            .map(|hit| {
                let path = hit["path"].as_str().unwrap().to_string();
                (path, hit["snippet"].as_str().unwrap().to_string())
            })
            .collect()
    }

    #[test]
    fn finds_pages_with_every_word_and_ranks_titles_first() {
        let dir = TestDir::new("search-rank");
        let root = dir.path();
        page(root, "", "# Home\n- [ ] Plan the Kyoto trip\n");
        let kyoto = "# Kyoto\n\n## Day 1\nTemples and a **trip** to Nara\n";
        page(root, "Trips/Kyoto", kyoto);
        page(root, "Trips/Rome", "\u{feff}# Rome\nKyoto next year\n");
        page(root, ".git/Kyoto", "# Kyoto\n");
        page(root, "Trips/assets/Kyoto", "# Kyoto\n");

        assert_eq!(
            found(root, "kyoto"),
            vec![
                hit("Trips/Kyoto", "Day 1"),
                hit("", "Plan the Kyoto trip"),
                hit("Trips/Rome", "Kyoto next year"),
            ]
        );
        assert_eq!(
            found(root, "TRIP kyoto"),
            vec![
                hit("Trips/Kyoto", "Temples and a **trip** to Nara"),
                hit("", "Plan the Kyoto trip"),
            ]
        );
        assert!(found(root, "   ").is_empty());
        assert!(found(root, "kyoto paris").is_empty());
    }

    #[test]
    fn cuts_long_lines_around_the_match() {
        let dir = TestDir::new("search-snippet");
        let root = dir.path();
        let long = format!("{} needle {}", "a".repeat(100), "b".repeat(200));
        page(root, "", &format!("# Home\n> {long}\n"));
        let snippet = &found(root, "needle")[0].1;
        assert!(snippet.starts_with('…'), "{snippet}");
        assert!(snippet.ends_with('…'), "{snippet}");
        assert!(snippet.contains(" needle "));
        assert_eq!(snippet.chars().count(), SNIPPET_CHARS + 2);
    }

    #[test]
    fn stops_when_a_newer_search_starts() {
        let dir = TestDir::new("search-superseded");
        page(dir.path(), "", "# Home\n");
        let reply = search(dir.path(), "home", &AtomicU64::new(2), 1).unwrap();
        assert_eq!(reply["superseded"], json!(true));
        assert_eq!(reply["results"], json!([]));
    }
}
