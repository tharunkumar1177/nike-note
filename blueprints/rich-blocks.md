# Rich blocks

## Outcome or responsibility

Pages show images, callouts, toggles, and tables the way Notion does, while the file stays Markdown that GitHub renders the same way. An image is a line that is only `![alt](path)`, and its file lives in the page's `assets/` folder. A callout is a GitHub alert (`> [!NOTE]` followed by `>` lines). A toggle is a `<details>` block with a `<summary>` line. A table is a GitHub table with aligned columns, edited like a Notion table: clicking a cell edits that cell, the keyboard moves between cells, the + bars at the right and bottom add a column or a row, and handles on each row and column open menus to insert, move, align, and delete. Images are added with `/image`, by pasting, or by dropping files on the page; tables, callouts, and toggles are added from the slash menu. Covers the block rules and table cells and edits in `@quire/markdown`, the helper's `readAsset` and `writeAsset`, the app's asset store, the block views, and the table editor.

## Current verified status

**Status:** Implemented

Verified in CI (Markdown unit tests for image, callout, and toggle rules, table cells, templates, and file links; helper unit tests for base64, chunked reads, path refusals, and unique image names on Windows, macOS, and Linux; end-to-end tests for every criterion below) and by hand in Chrome on Windows with the CI build: on a CRLF page with a byte order mark, a 600 KiB image read in two chunks showed with its caption, a Tip callout, a toggle that opened without entering editing and kept its to-do read-only, and a table with left and right columns rendered, and a PNG dropped between two lines was saved byte for byte and its line written there, with the endings kept. Table editing is verified in CI (Markdown unit tests for cell, row, column, and alignment edits, escaping, and rewriting only changed rows; end-to-end tests for typing in cells, Tab, Enter, and the arrow keys, the + bars, and every row and column menu action) and by hand in Chrome on Windows with the CI build on a CRLF page with a byte order mark: a cell edited in place, Tab past the last cell adding a row, the + bar adding a column, Align right, and Delete row, with the byte order mark and CRLF endings kept. Hand testing found a stray vertical scrollbar beside tables and handles hidden while their own menu was open; both are fixed.

## Architecture dependencies

- [Block model and line mapping](../architecture.md#block-model-and-line-mapping): the image, callout, and toggle block rules.
- [Page assets](../architecture.md#page-assets): how image bytes cross the native messaging limit and where new images are saved.
- [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety): image paths are checked like page paths.

## Local rules and implications

- Rule ownership: the block rules, table cell splitting, file link resolution, and the image line form live in `packages/markdown`. The app renders what the parser returns.
- Images resolve relative to the page folder. Files inside the notes folder load through the helper in 512 KiB chunks and are shown from object URLs; the 64 most recently used stay loaded. `https` images load directly with no referrer. Anything else (other schemes, paths that leave the notes folder) shows an explanation instead of the image. A failed load shows the error with **Try again**.
- New images are saved as new files in `<page>/assets/`, never replacing a file: the name is cleaned like a page folder name and a taken name gets ` 2`, ` 3`, and so on. The image line goes on the empty line being edited or after it (`/image`, paste), or where the files were dropped. PNG, JPEG, GIF, WebP, AVIF, BMP, and SVG up to 16 MiB are accepted.
- Callout kinds are Note, Tip, Important, Warning, and Caution, case-insensitive, with the marker alone on its line; any other `> [!x]` line stays a quote.
- A toggle runs from a `<details>` line (optionally `open`) to its matching `</details>`, counting nested toggles; an unclosed one stays text. Its body renders as read-only blocks, and its to-do boxes are disabled. Links to sub-pages inside a toggle count as linked.
- Table cells hold inline Markdown; `\|` is a literal pipe. Rows are padded or cut to the header's column count, and the delimiter row sets each column's alignment.
- Callouts and toggles are multi-line blocks: clicking one edits its source, as code blocks do. Clicking a toggle's summary only opens or closes it.
- Tables are always shown as a grid (`TableEditor`); only the cell being edited is a text box, and the caret's `column` in a table is the cell's index. A cell's text box keeps spaces typed at either end until the next character, though the file trims them. Typed `|` is saved as `\|`, and a line break becomes a space, since a row is one line.
- Table keys: Tab and Shift+Tab move along the rows, and Tab in the last cell adds a row; Enter moves down and adds a row from the bottom row; the arrow keys move between cells (Left and Right only at a cell's edge), and Up from the header or Down from the last row leave the table; Escape stops editing; Ctrl+B, Ctrl+I, Ctrl+E, and Ctrl+Shift+X style the selection.
- Table menus: a column can be aligned left, center, or right, inserted left or right, moved, or deleted (never the last column); a body row can be inserted above or below, moved, or deleted, and the header row offers only Insert row below. Menus open in the top layer so a scrolled table cannot clip them, and close on Escape, a click outside, or scrolling.
- Edits write back only the rows they change, so a hand-formatted table keeps its other lines byte for byte. Rows that change, and every row when the columns change, are written as `| a | b |` with `---`, `:---`, `:---:`, or `---:` delimiters.

## Related blueprints

### Required

- [page-rendering](page-rendering.md): the block views and inline rendering this extends.
- [slash-menu](slash-menu.md): the commands that add rich blocks.

### Impact checks

- [page-editing](page-editing.md): check when multi-line editing or the edit path changes.
- [native-helper](native-helper.md): check when helper methods or size limits change.
- [auto-sync](auto-sync.md): check when asset files change, since sync commits them.

## Relevant implementation and tests

- `packages/markdown/src/{blocks,table,links,edit}.ts`, `packages/markdown/tests/{rich,table}.test.ts`
- `apps/extension/src/app/blocks/TableEditor.tsx`, `apps/extension/e2e/tables.spec.ts`
- `helper/src/{assets,base64,host}.rs`, with unit tests
- `apps/extension/src/app/assetStore.ts`, `apps/extension/src/app/blocks/{RichBlocks,BlockView,PageEditor}.tsx`, `apps/extension/src/shared/slash.ts`
- `apps/extension/e2e/rich-blocks.spec.ts`

## Acceptance or verification criteria

- [x] An image in the page's `assets/` folder, a Warning callout with bold text, a toggle with a to-do inside, and a table with a right-aligned column render formatted.
- [x] `/table` adds a table and the typing goes into its first body cell.
- [x] An image file dropped between two blocks is saved into `assets/` and its line is written there.
- [x] Clicking a table cell edits only that cell; Tab, Shift+Tab, and the arrow keys move between cells and out of the table, and Tab in the last cell adds a row.
- [x] The + bars add a column and a row; the column menu aligns, moves, and deletes columns, and the row menu moves and deletes rows; the file changes only in the rows edited.

## Remaining gaps and unknowns

- Table columns cannot be resized and rows and columns cannot be dragged; moving uses the menus. Several cells cannot be selected at once, and pasting a spreadsheet range goes into one cell.
- Toggle bodies are edited as source together with the summary.
- Images inside a line of text stay as text; only a line that is only an image becomes an image block.
- An image replaced on disk while its page is open keeps showing the old picture until Quire is reopened, since the watcher ignores `assets` folders.
- Images cannot be resized or captioned from Quire; the title in `![alt](path "title")` is shown as the caption.
