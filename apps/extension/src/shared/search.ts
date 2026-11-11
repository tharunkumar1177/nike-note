/**
 * Result of the helper's `search` method, its validator, and the split of a
 * snippet into plain and highlighted parts (see blueprints/search.md).
 */
import { isRecord } from "./protocol";

/** One matching page. */
export interface SearchHit {
  path: string;
  title: string;
  /** Text around the first match in the page body; may be empty. */
  snippet: string;
}

/** One finished search. */
export interface SearchResult {
  results: SearchHit[];
  /** True when more pages matched than the helper sent. */
  truncated: boolean;
  /** True when a newer search started first; the results are then empty. */
  superseded: boolean;
}

/** A run of snippet or title text, highlighted when it matched a query word. */
export interface TextPart {
  text: string;
  match: boolean;
}

/** Most query words the helper uses; the highlight uses the same ones. */
const MAX_WORDS = 8;

/**
 * Validate one result of `search`.
 */
function parseHit(value: unknown): SearchHit {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.title !== "string" ||
    typeof value.snippet !== "string"
  ) {
    throw new TypeError("The helper sent an invalid search result.");
  }
  return { path: value.path, title: value.title, snippet: value.snippet };
}

/**
 * Validate the result of `search`.
 */
export function parseSearchResult(value: unknown): SearchResult {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new TypeError("The helper sent an invalid search result.");
  }
  return {
    results: value.results.map(parseHit),
    truncated: value.truncated === true,
    superseded: value.superseded === true,
  };
}

/**
 * The words of `query`, lowercased, as the helper splits them.
 */
export function queryWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
}

/**
 * Split `text` into runs, marking every case-insensitive occurrence of one of
 * `words` as a match. Overlapping occurrences merge into one match.
 */
export function highlight(text: string, words: readonly string[]): TextPart[] {
  const lower = text.toLowerCase();
  const marked = new Array<boolean>(text.length).fill(false);
  if (lower.length === text.length) {
    for (const word of words) {
      if (word === "") continue;
      let at = lower.indexOf(word);
      while (at >= 0) {
        marked.fill(true, at, at + word.length);
        at = lower.indexOf(word, at + 1);
      }
    }
  }
  const parts: TextPart[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const match = marked[index] === true;
    const char = text.charAt(index);
    const last = parts.at(-1);
    if (last && last.match === match) last.text += char;
    else parts.push({ text: char, match });
  }
  return parts;
}
