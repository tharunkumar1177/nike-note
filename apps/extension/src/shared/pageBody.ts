/**
 * Page bodies exchanged with the helper (`readPage`, `writePage`) and the
 * `filesChanged` event, with their validators (see blueprints/page-editing.md).
 */
import { isRecord } from "./protocol";

/** The text of a page's README.md; `exists` is false and `hash` null when the folder has none yet. */
export interface PageBody {
  path: string;
  exists: boolean;
  content: string;
  hash: string | null;
}

/** The result of `writePage`: the hash of the text now on disk. */
export interface SavedPage {
  path: string;
  hash: string;
}

/** Pages whose README.md changed on disk; `pages` is null when everything should be re-read. */
export interface FilesChanged {
  pages: string[] | null;
}

/**
 * Validate the result of `readPage`.
 */
export function parsePageBody(value: unknown): PageBody {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.exists !== "boolean" ||
    typeof value.content !== "string" ||
    (value.hash !== null && typeof value.hash !== "string")
  ) {
    throw new TypeError("The helper sent an invalid page.");
  }
  return { path: value.path, exists: value.exists, content: value.content, hash: value.hash };
}

/**
 * Validate the result of `writePage`.
 */
export function parseSavedPage(value: unknown): SavedPage {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.hash !== "string") {
    throw new TypeError("The helper sent an invalid save result.");
  }
  return { path: value.path, hash: value.hash };
}

/**
 * Validate the data of a `filesChanged` event, or null when it is malformed.
 */
export function parseFilesChanged(value: unknown): FilesChanged | null {
  if (!isRecord(value) || !Array.isArray(value.pages)) return null;
  const pages = value.pages.filter((page): page is string => typeof page === "string");
  return { pages: value.rescan === true ? null : pages };
}
