# Page tree

## Outcome or responsibility

The sidebar shows every page in the notes folder as an expandable tree in the order the user wrote their links, and selecting a page opens it with a breadcrumb trail and its sub-pages. Covers the helper's tree scan, the app's tree store, the sidebar tree, page routing, and the page header.

## Current verified status

**Status:** Implemented

Delivered by slice 4. Helper unit tests cover titles, link lines, ordering, exclusions, and truncation on all three operating systems; `e2e/pages.spec.ts` covers the tree, routing, keyboard use, and refresh on Linux; the CI build was checked by hand in Chrome on Windows. Page bodies are rendered by [page-rendering](page-rendering.md).

## Architecture dependencies

- [Page structure](../architecture.md#page-structure): what a page is, how titles and order are derived, the `pageTree` shape, and the scan limits.
- [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety): page paths are relative to the root with `/` separators.
- [Native messaging protocol](../architecture.md#native-messaging-protocol): `pageTree` returns `NOT_FOUND` when no notes folder is usable, and must stay under the 1 MiB reply limit.

## Local rules and implications

- The helper builds the whole tree in one request (`helper/src/pages.rs`). Titles and link lines are read with a line scanner, not the Markdown parser, because only those two facts are needed and the helper must stay dependency-light.
- Rule ownership: the title and link rules live in `pages.rs`. The app never re-derives them; it shows `title` as given.
- Routing (`src/app/route.ts`): the URL fragment holds the page path, one percent-encoded segment per folder. Malformed fragments open the root page. Opening a page adds a history entry, so Back and Forward work.
- Sidebar tree (`src/app/PageTreeNav.tsx`): ARIA `tree` with flat `treeitem` rows and `aria-level`. The root page is the first row; its children are top-level rows. Ancestors of the open page are expanded unless the user collapsed them. Keys: Up and Down move, Right expands then enters, Left collapses then goes to the parent, Home and End jump, Enter and Space open. One row is in the tab order.
- Freshness: the tree reloads when the tab becomes visible. Overlapping reloads collapse into one follow-up request.
- Changing the notes folder opens the new folder's root page.

## Related blueprints

### Required

- [workspace-setup](workspace-setup.md): the workspace is shown only after setup is complete.

### Impact checks

- [native-helper](native-helper.md): check when the request loop or error codes change.
- [extension-shell](extension-shell.md): check when the workspace layout or status bar changes.

## Relevant implementation and tests

- `helper/src/pages.rs`: tree scan, title and link rules, with unit tests
- `apps/extension/src/shared/pages.ts`: types, parser, trail lookup, and URL fragments
- `apps/extension/src/app/pageTreeStore.ts`, `PageTreeNav.tsx`, `PageView.tsx`, `route.ts`, `Workspace.tsx`: app side
- `apps/extension/tests/pages.test.ts`: unit tests
- `apps/extension/e2e/pages.spec.ts`, `apps/extension/e2e/notes.ts`: end-to-end tests against a seeded notes repository

## Acceptance or verification criteria

- [x] Pages appear in link order, then by name; titles come from the first `# ` line outside code fences, falling back to the folder name.
- [x] `assets/`, dot folders, and loose Markdown files are not pages.
- [x] Selecting a page in the tree updates the URL, the heading, the breadcrumb, and the window title, and the page survives a reload.
- [x] The tree is usable from the keyboard alone.
- [x] A folder without `README.md` and an unknown page path each show an explanation.
- [x] A page added outside Quire appears when the tab is shown again.

## Remaining gaps and unknowns

- Link targets are matched to folder names exactly, so on case-insensitive file systems a link with different letter case does not set the order.
- Trees larger than 5,000 pages are cut off; paging the tree is not designed yet.
