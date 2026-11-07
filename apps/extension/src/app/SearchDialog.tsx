/**
 * Quick search (see blueprints/search.md): a dialog that asks the helper for
 * pages matching the typed words and opens the chosen one.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import type { HelperConnection } from "../shared/helperClient";
import { pageTrail, type PageNode } from "../shared/pages";
import { highlight, parseSearchResult, queryWords, type SearchHit } from "../shared/search";
import { Modal } from "./PageActions";

/** Quiet time after the last keystroke before searching. */
const DEBOUNCE_MS = 120;
/** Searches walk every page, so they get longer than ordinary requests. */
const SEARCH_TIMEOUT_MS = 30_000;

/** What the results list shows. */
interface SearchView {
  /** The query the results belong to. */
  query: string;
  results: SearchHit[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
}

const EMPTY: SearchView = { query: "", results: [], truncated: false, loading: false, error: null };

/**
 * Turn any thrown value into a readable message.
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The line below the results: an error, an empty or cut-short result, or a
 * hint before anything is typed. `settled` is true once the shown results
 * belong to the typed query.
 */
function statusText(view: SearchView, typed: boolean, settled: boolean): string {
  if (view.error !== null) return `Quire couldn't search: ${view.error}`;
  if (!typed) return "Type to search page titles and text.";
  if (settled && view.results.length === 0) return "No pages match.";
  if (settled && view.truncated) return `Showing the best ${view.results.length} matches.`;
  return "";
}

/**
 * Text with the runs that match `words` in `<mark>`.
 */
function Highlighted({ text, words }: { text: string; words: readonly string[] }) {
  return highlight(text, words).map((part, index) =>
    part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
  );
}

/**
 * The search dialog, open while it is mounted. `root` is the page tree, used
 * to show where each result lives.
 */
export function SearchDialog({
  helper,
  root,
  onOpen,
  onClose,
}: {
  helper: HelperConnection;
  root: PageNode;
  onOpen: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<SearchView>(EMPTY);
  const [active, setActive] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(0);
  const titleId = useId();
  const listId = useId();
  const words = queryWords(view.query);
  const results = view.results;
  const activeIndex = Math.min(active, results.length - 1);
  const optionId = (index: number): string => `${listId}-${index}`;

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      latest.current += 1;
    },
    [],
  );

  /** Ask the helper for `text`, ignoring replies to searches typed over since. */
  const search = (text: string): void => {
    latest.current += 1;
    const sequence = latest.current;
    setView((current) => ({ ...current, loading: true, error: null }));
    helper.request("search", { query: text }, parseSearchResult, SEARCH_TIMEOUT_MS).then(
      (result) => {
        if (sequence !== latest.current || result.superseded) return;
        setView({
          query: text,
          results: result.results,
          truncated: result.truncated,
          loading: false,
          error: null,
        });
        setActive(0);
      },
      (error: unknown) => {
        if (sequence !== latest.current) return;
        setView((current) => ({ ...current, loading: false, error: describe(error) }));
      },
    );
  };

  /** Keep the typed text and search for it once typing pauses. */
  const onType = (text: string): void => {
    setQuery(text);
    window.clearTimeout(timer.current);
    if (queryWords(text).length === 0) {
      latest.current += 1;
      setView(EMPTY);
      return;
    }
    timer.current = window.setTimeout(() => search(text), DEBOUNCE_MS);
  };

  /** Move through the results with the arrow keys; Enter opens the active one. */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = results[activeIndex];
      if (chosen) onOpen(chosen.path);
    }
  };

  const typed = queryWords(query).length > 0;
  const settled = typed && !view.loading && view.error === null && view.query === query;
  return (
    <Modal labelledBy={titleId} className="search-dialog" onClose={onClose}>
      <h2 id={titleId} className="q-visually-hidden">
        Search pages
      </h2>
      <input
        className="modal__input"
        role="combobox"
        aria-label="Search pages"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
        aria-busy={view.loading}
        placeholder="Search pages"
        spellCheck={false}
        value={query}
        onChange={(event) => onType(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} className="search-dialog__list" role="listbox" aria-label="Results">
        {results.map((hit, index) => {
          const trail = pageTrail(root, hit.path)
            .slice(0, -1)
            .map((step) => step.title)
            .join(" / ");
          return (
            <li
              key={hit.path}
              id={optionId(index)}
              className={`search-dialog__option${index === activeIndex ? " search-dialog__option--active" : ""}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => onOpen(hit.path)}
            >
              <span className="search-dialog__title">
                <Highlighted text={hit.title} words={words} />
              </span>
              {trail && <span className="search-dialog__trail">{trail}</span>}
              {hit.snippet && (
                <span className="search-dialog__snippet">
                  <Highlighted text={hit.snippet} words={words} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="search-dialog__status" role="status">
        {statusText(view, typed, settled)}
      </p>
    </Modal>
  );
}
