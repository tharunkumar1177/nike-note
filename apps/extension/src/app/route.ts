/**
 * The open page, kept in the URL fragment so reloads and back/forward work.
 */
import { pageHash, pathFromHash } from "../shared/pages";

/**
 * Subscribe to page changes for `useSyncExternalStore`.
 */
export function subscribeRoute(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

/**
 * The path of the open page.
 */
export function currentPage(): string {
  return pathFromHash(window.location.hash);
}

/**
 * Open a page, adding a history entry.
 */
export function openPage(path: string): void {
  window.location.hash = pageHash(path);
}

/**
 * Show page `path` in place of the current history entry, for a page that
 * moved or was deleted.
 */
export function replacePage(path: string): void {
  window.location.replace(pageHash(path));
}
