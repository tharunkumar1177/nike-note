/**
 * A page body returned by the helper's `readPage` and its validator
 * (see blueprints/page-rendering.md).
 */
import { isRecord } from "./protocol";

/** The text of a page's README.md; `exists` is false when the folder has none yet. */
export interface PageBody {
  path: string;
  exists: boolean;
  content: string;
}

/**
 * Validate the result of `readPage`.
 */
export function parsePageBody(value: unknown): PageBody {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.exists !== "boolean" ||
    typeof value.content !== "string"
  ) {
    throw new TypeError("The helper sent an invalid page.");
  }
  return { path: value.path, exists: value.exists, content: value.content };
}
