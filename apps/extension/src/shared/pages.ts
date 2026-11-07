/**
 * Page tree returned by the helper, its validator, and lookups by page path
 * (see blueprints/page-tree.md). A page path is the folder path relative to the
 * notes folder with `/` separators; the root page has the empty path.
 */
import { isRecord } from "./protocol";

/** One page: a folder whose body is its README.md. */
export interface PageNode {
  path: string;
  name: string;
  title: string;
  hasReadme: boolean;
  children: PageNode[];
}

/** The whole tree and whether the helper stopped early because it was too large. */
export interface PageTree {
  root: PageNode;
  truncated: boolean;
}

/** Deepest nesting accepted from the helper, matching its own scan limit. */
const MAX_DEPTH = 65;

/**
 * Validate one page node and its children.
 */
function parseNode(value: unknown, depth: number): PageNode {
  if (
    depth > MAX_DEPTH ||
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.name !== "string" ||
    typeof value.title !== "string" ||
    typeof value.hasReadme !== "boolean" ||
    !Array.isArray(value.children)
  ) {
    throw new TypeError("The helper sent an invalid page tree.");
  }
  return {
    path: value.path,
    name: value.name,
    title: value.title,
    hasReadme: value.hasReadme,
    children: value.children.map((child: unknown) => parseNode(child, depth + 1)),
  };
}

/** A page made by `createPage`: its path, folder name, and title. */
export interface CreatedPage {
  path: string;
  folder: string;
  title: string;
}

/**
 * Validate the result of `createPage`.
 */
export function parseCreatedPage(value: unknown): CreatedPage {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.folder !== "string" ||
    typeof value.title !== "string" ||
    value.folder === "" ||
    !value.path.endsWith(value.folder)
  ) {
    throw new TypeError("The helper sent an invalid new page.");
  }
  return { path: value.path, folder: value.folder, title: value.title };
}

/**
 * Validate the result of `pageTree`.
 */
export function parsePageTree(value: unknown): PageTree {
  if (!isRecord(value)) throw new TypeError("The helper sent an invalid page tree.");
  return { root: parseNode(value.root, 0), truncated: value.truncated === true };
}

/**
 * The chain of pages from the root to `path`, or an empty list when the page does not exist.
 */
export function pageTrail(root: PageNode, path: string): PageNode[] {
  const trail = [root];
  if (path === "") return trail;
  let node = root;
  for (const segment of path.split("/")) {
    const next = node.children.find((child) => child.name === segment);
    if (!next) return [];
    trail.push(next);
    node = next;
  }
  return trail;
}

/**
 * The page at `path`, or null.
 */
export function findPage(root: PageNode, path: string): PageNode | null {
  return pageTrail(root, path).at(-1) ?? null;
}

/**
 * True when `ancestor` is a strict ancestor of `path`. The root is the ancestor of every other page.
 */
export function isAncestor(ancestor: string, path: string): boolean {
  if (ancestor === path) return false;
  return ancestor === "" || path.startsWith(`${ancestor}/`);
}

/**
 * The URL fragment that opens a page, for example `#/Trips/Japan%202027`.
 */
export function pageHash(path: string): string {
  return `#/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * The page path named by a URL fragment. Malformed fragments open the root page.
 */
export function pathFromHash(hash: string): string {
  const raw = hash.replace(/^#\/?/, "");
  try {
    return raw
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .filter((segment) => segment !== "")
      .join("/");
  } catch {
    return "";
  }
}
