/**
 * Page operations on the notes folder (see blueprints/page-operations.md):
 * add, rename, move, and delete pages through the helper, keeping the open
 * page, unsaved text, and the address bar pointed at the right place.
 */
import type { HelperConnection } from "../shared/helperClient";
import {
  isWithin,
  movedPath,
  parentPath,
  parseChangedPage,
  parseCreatedPage,
  type CreatedPage,
} from "../shared/pages";
import type { PageEditorStore } from "./pageEditorStore";
import type { PageTreeStore } from "./pageTreeStore";
import { currentPage, openPage, replacePage } from "./route";

/** Title given to a page added from the sidebar. */
const NEW_PAGE_TITLE = "Untitled";

/** What the sidebar and the page header can do to pages. */
export interface PageOps {
  /** Add a linked sub-page of `parent` and open it. */
  create(parent: string): Promise<CreatedPage>;
  /** Give page `path` a new title, renaming its folder when it follows the title. */
  rename(path: string, title: string): Promise<void>;
  /** Move page `path` into page `parent`. */
  move(path: string, parent: string): Promise<void>;
  /** Delete page `path` and its sub-pages. */
  remove(path: string): Promise<void>;
}

/**
 * Page operations for one helper connection. Each one first saves every
 * pending edit, so the helper works on the text the user sees.
 */
export function createPageOps(
  helper: HelperConnection,
  pages: PageTreeStore,
  editor: PageEditorStore,
): PageOps {
  /**
   * After page `from` became page `to`, reload the tree, move the open page
   * and unsaved text along, and re-read the open page.
   */
  const follow = async (from: string, to: string): Promise<void> => {
    const loaded = pages.load();
    const open = currentPage();
    if (from !== to && isWithin(open, from)) replacePage(movedPath(open, from, to));
    await (from === to ? editor.refresh(null) : editor.relocate(from, to));
    await loaded;
  };

  return {
    async create(parent) {
      await editor.settle();
      const created = await helper.request(
        "createPage",
        { parent, title: NEW_PAGE_TITLE, link: true },
        parseCreatedPage,
      );
      await Promise.all([pages.load(), editor.refresh(null)]);
      openPage(created.path);
      return created;
    },

    async rename(path, title) {
      await editor.settle();
      const renamed = await helper.request("renamePage", { path, title }, parseChangedPage);
      await follow(path, renamed.path);
    },

    async move(path, parent) {
      await editor.settle();
      const moved = await helper.request("movePage", { path, parent }, parseChangedPage);
      await follow(path, moved.path);
    },

    async remove(path) {
      await editor.settle();
      await helper.request("deletePage", { path }, () => undefined);
      const loaded = pages.load();
      editor.forget(path);
      if (isWithin(currentPage(), path)) replacePage(parentPath(path));
      else await editor.refresh(null);
      await loaded;
    },
  };
}
