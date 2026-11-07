# Page operations

## Outcome or responsibility

Pages are added, renamed, moved, and deleted from the sidebar, like Notion. Each tree row has an actions button and an add button, a right-click menu, F2 to rename in place, Delete to delete, and drag and drop onto another row to move. Editing the page title in the header also renames the page. Every operation is plain file work done by the helper: folders are created, renamed, moved, and removed, the parent's link lines are kept in step, and relative links anywhere in the notes folder are rewritten so they still point at the same pages. Covers the helper's `createPage` linking, `renamePage`, `movePage`, `deletePage`, and relinking, and the app's page actions, dialogs, and session handling around them.

## Current verified status

**Status:** Implemented

Verified in CI (helper unit tests for title and link-line edits, folder following, relinking, moving, refusing moves into a page's own sub-pages, and deleting, on Windows, macOS, and Linux; end-to-end tests for every criterion below) and by hand in Chrome on Windows with the CI build: on a CRLF page with a byte order mark, a rename from the right-click menu, a real mouse drag into another page, a header title edit, and Delete with the confirmation dialog each kept the byte order mark and CRLF endings, rewrote the parent link lines, a link with a fragment, and the moved page's `../` link, and kept the open page at its new address.

## Architecture dependencies

- [Page structure](../architecture.md#page-structure): folder naming, link lines, the operation methods, and relinking.
- [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety): every page path is checked, and the root page is never moved or deleted.
- [File write-back and change watching](../architecture.md#file-write-back-and-change-watching): bodies are written atomically with the hash they were read at.

## Local rules and implications

- A folder follows its title only while it already does: a rename renames the folder when its name is the title's folder name (or that name with ` 2`, ` 3`, and so on) and the new title gives a different name. A folder named by hand keeps its name. The root page's title changes but its folder never does.
- Rename writes the new `# ` line in place (or adds one after front matter), rewrites the parent's link lines to the new title and folder, keeping their indentation and line endings, and then rewrites links to the old folder.
- Move refuses the root page, the page itself, and its sub-pages as targets, and does nothing when the parent is unchanged. It removes the link lines from the old parent, adds one at the end of the new parent, and takes the page's sub-pages and files along. A name taken in the new parent gets ` 2`, ` 3`, and so on.
- Relinking scans every page body (the same exclusions and limits as the page tree) and rewrites relative inline links and reference definitions whose target lies inside the moved folder, and the moved page's own outward links. Fenced code, code spans, front matter, external links, fragment-only links, and absolute paths are left alone; a `#` or `?` suffix is kept; the byte order mark and line endings are kept.
- Delete is permanent: it asks for confirmation, names the number of sub-pages, says that synced versions stay in the Git history, removes the folder with everything in it, and removes the parent's link lines.
- Before any operation the app saves every pending edit and waits for saves in flight. After it, open editing sessions move to the new paths, the open page's URL is replaced (not pushed), and a deleted open page goes to its parent.
- A new page from the sidebar is titled Untitled and linked from the parent in the same request, then opened. Its title can be typed at once; the folder follows when the title loses focus. Autosave has written the title by then, so the editor sends the title from before the first keystroke as `from`.
- The menu moves with the arrow keys, Home, and End and closes on Escape or Tab, returning focus to the row. Errors show in the sidebar with a Dismiss button.

## Related blueprints

### Required

- [page-tree](page-tree.md): the tree, rows, keys, and routing this extends.
- [page-editing](page-editing.md): the save path and sessions that are settled and moved.

### Impact checks

- [slash-menu](slash-menu.md): check when `createPage` or folder naming changes.
- [auto-sync](auto-sync.md): check when many files change at once, since sync commits them.

## Relevant implementation and tests

- `helper/src/{pageops,relink,pages,body,host}.rs`, with unit tests
- `apps/extension/src/app/{pageOps.ts,pageEditorStore.ts,PageActions.tsx,PageTreeNav.tsx,PageView.tsx,Workspace.tsx,route.ts,blocks/PageEditor.tsx}`, `apps/extension/src/shared/pages.ts`
- `apps/extension/e2e/page-operations.spec.ts`

## Acceptance or verification criteria

- [x] Renaming from the sidebar menu renames the folder, rewrites the title line, the parent's link line, and a link with a fragment elsewhere, and keeps the page open at its new address.
- [x] Adding a page from the sidebar creates a linked Untitled page and opens it; typing a title in the header renames its folder when the title loses focus.
- [x] Moving a page with the dialog and dragging it back rewrites the link lines in both parents and the links into and out of the page.
- [x] Deleting asks first, Cancel keeps the page, and Delete removes the folder and its sub-pages and the link line and opens the parent.

## Remaining gaps and unknowns

- There is no trash in the app; a deleted page can only be restored from the Git history.
- Deleting a page removes only its parent's link lines; inline links to it elsewhere are left in place and stop resolving.
- Dragging a row moves a page into another page; reordering pages within a parent by drag is not designed yet.
- Link targets are compared exactly, so a link written with different letter case on a case-insensitive file system is not rewritten.
- Links in loose Markdown files outside page bodies are not rewritten.
