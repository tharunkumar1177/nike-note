# Page editing

## Outcome or responsibility

The user edits a page in place and never has to save: changes reach `README.md` moments after typing stops, lines the user did not touch stay byte for byte, edits made in another editor show up while the page is open, and a change on disk is never overwritten without the user choosing to. Covers the helper's `writePage` and `watch`, the Markdown package's source edits, the app's editor store, and the editable page view.

## Current verified status

**Status:** Partial

Code, unit tests, and end-to-end tests are written for slice 6. Not yet verified by CI or by hand in Chrome.

## Architecture dependencies

- [File write-back and change watching](../architecture.md#file-write-back-and-change-watching): `writePage`, `STALE`, atomic replacement, `watch`, and the `filesChanged` event.
- [Block model and line mapping](../architecture.md#block-model-and-line-mapping): edits touch only their own lines and keep line endings.
- [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety): every write goes through the page path check.
- [Native messaging protocol](../architecture.md#native-messaging-protocol): events and the `STALE` code.

## Local rules and implications

- Editing model (`src/app/blocks/PageEditor.tsx`): the block holding the caret shows its Markdown source in a growing text box; other blocks render formatted. The caret is tracked as a source line and column, so it stays put when an edit changes block boundaries. Slice 8 replaces visible markers with Notion-style shortcuts.
- Keys: Enter splits a one-line block and continues bullet, numbered, and to-do lists; Enter on an empty item moves it one level out, then ends the list. Backspace at the start joins the line to the one before (never into the title or a multi-line block). Up and Down at the first or last line move between blocks and the title. Enter inside code, tables, and front matter inserts a newline.
- Typing an opening code fence into a one-line block adds the closing fence, so the rest of the page does not turn into code while typing.
- The title is the first `# ` line. Editing it rewrites that line; clearing it removes the line, so the folder name shows again; a page without one gets a new first line after any front matter.
- Clicking a to-do checkbox toggles only the `[ ]` or `[x]` in its line.
- Saving (`src/app/pageEditorStore.ts`): each edited page has a session with the text, the last saved text, and the hash it was read or saved at. Saves run 700 ms after the last edit, when switching pages, and when the tab is hidden; leaving with unsaved changes asks the browser to confirm. One save is in flight per page; edits made meanwhile are saved right after.
- Changes on disk: a `filesChanged` event for the open page re-reads it. A hash equal to the session's means it was Quire's own write. A saved page takes the new text; a page with unsaved edits shows a conflict banner with **Keep my version** (overwrite the file) and **Use the version on disk**. A `STALE` save leads to the same banner.
- Every `filesChanged` event also reloads the page tree, so new, renamed, and retitled pages appear without a reload.

## Related blueprints

### Required

- [page-rendering](page-rendering.md): formatted blocks and link handling are shared.
- [page-tree](page-tree.md): the open page and sub-page titles.

### Impact checks

- [native-helper](native-helper.md): check when the request loop, events, or error codes change.
- [build-pipeline](build-pipeline.md): check when helper dependencies change, since `Cargo.lock` must be committed from CI.

## Relevant implementation and tests

- `helper/src/body.rs`: `read_page`, `write_page`, hashing, atomic replacement, with unit tests
- `helper/src/watch.rs`: watcher, batching, and path classification, with unit tests and a live watch test
- `helper/src/host.rs`: `writePage` and `watch` dispatch
- `packages/markdown/src/edit.ts`, `packages/markdown/tests/edit.test.ts`
- `apps/extension/src/app/pageEditorStore.ts`, `apps/extension/src/app/blocks/PageEditor.tsx`, `apps/extension/src/app/PageView.tsx`, `apps/extension/src/app/Workspace.tsx`
- `apps/extension/src/shared/pageBody.ts`, `apps/extension/tests/pageBody.test.ts`
- `apps/extension/e2e/editing.spec.ts`

## Acceptance or verification criteria

- [ ] Editing a line saves the file with every other line unchanged, including the byte order mark and `\r\n` endings.
- [ ] Enter continues lists; editing the title renames the page in the sidebar.
- [ ] A change made outside Quire appears on the open page without reloading.
- [ ] A change on disk that conflicts with unsaved edits is never overwritten without the user choosing to.
- [ ] Writing on a page without `README.md` creates it.
- [ ] Stale writes, oversized writes, and paths outside the notes folder are refused by the helper.

## Remaining gaps and unknowns

- Undo is the text box's own undo within one block; page-level undo is not designed yet.
- Linux limits the number of inotify watches; a notes folder with more folders than the limit reports a rescan and relies on reloading when the tab is shown.
- The conflict banner offers whole-file choices only; there is no line-level merge.
