# Search

## Outcome or responsibility

Ctrl+K (Command+K on macOS) or Ctrl+P opens a search box from anywhere in the workspace, as Notion's quick search does. Typing finds pages whose title or text contains every typed word, best matches first, each with where it lives and a snippet around the match with the words highlighted. The arrow keys and Enter, or a click, open a page. The helper does the searching so the browser never reads the whole notes folder. Covers the helper's `search` method, its worker thread, and the app's search dialog, sidebar button, and shortcuts.

## Current verified status

**Status:** Implemented

Verified in CI (helper unit tests for matching every word, title-first ranking, hidden and `assets` folders, snippets with markers stripped and long lines cut, supersession, and the deferred host reply on Windows, macOS, and Linux; Vitest for the result validator, query words, and highlighting; end-to-end tests for every criterion below) and by hand in Chrome on Windows with the CI build: on CRLF pages with a byte order mark, Ctrl+K from the page and from an edited line and Ctrl+P opened search, `zephyr` ranked the title match first, `crème WINDOW` found and highlighted accented text, the arrow keys, Enter, and Escape worked, and the opened nested page rendered.

## Architecture dependencies

- [Search](../architecture.md#search): the `search` method, matching, ranking, snippets, and limits.
- [Page structure](../architecture.md#page-structure): which folders are pages and how titles are read.
- [Native messaging protocol](../architecture.md#native-messaging-protocol): replies may arrive out of order; the app matches them by `id`.

## Local rules and implications

- Rule ownership: matching, ranking, and snippets live in `helper/src/search.rs`. The app only splits the query into words again to highlight them (`apps/extension/src/shared/search.ts`), using the same rule: whitespace-separated, lowercased, at most eight.
- The app searches 120 ms after typing pauses. A reply to a query that was typed over is ignored, and the helper stops a search early when a newer one starts.
- Ctrl+K inside an edited line opens the link toolbar when text is selected or the caret is on a link; otherwise it opens search. Shortcuts pressed inside another open dialog are ignored.
- Results are selected by the arrow keys or by moving the mouse over them, never by a result appearing under a resting pointer.
- Closing the dialog (Escape, the backdrop, or opening a page) returns focus to where it was.

## Related blueprints

### Required

- [page-tree](page-tree.md): the trail shown under each result and the page that opens.

### Impact checks

- [inline-formatting](inline-formatting.md): check when Ctrl+K handling in the editor changes.
- [native-helper](native-helper.md): check when the request loop or worker threads change.

## Relevant implementation and tests

- `helper/src/{search,pages,host}.rs`, with unit tests
- `apps/extension/src/shared/search.ts`, `apps/extension/tests/search.test.ts`
- `apps/extension/src/app/{SearchDialog,Workspace}.tsx`
- `apps/extension/e2e/search.spec.ts`

## Acceptance or verification criteria

- [x] Ctrl+K opens search; typing a word lists the pages that contain it, title matches first, with the page's trail and a highlighted snippet.
- [x] Every typed word must match, and a query that matches nothing says so.
- [x] The arrow keys and Enter, or a click, open a result; Escape closes the dialog.

## Remaining gaps and unknowns

- Matching is by substring, without stemming, typo tolerance, or phrase queries.
- Every search reads every page body; there is no index, so very large notes folders search more slowly.
- Search finds pages only, not text inside images or other files in `assets/`.
- Snippets show the line's Markdown source after its leading marker, so inline syntax such as `**` or table pipes stays visible.
