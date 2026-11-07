# Rich blocks

## Outcome or responsibility

Pages show images, callouts, toggles, and tables the way Notion does, while the file stays Markdown that GitHub renders the same way. An image is a line that is only `![alt](path)`, and its file lives in the page's `assets/` folder. A callout is a GitHub alert (`> [!NOTE]` followed by `>` lines). A toggle is a `<details>` block with a `<summary>` line. A table is a GitHub table with aligned columns. Images are added with `/image`, by pasting, or by dropping files on the page; tables, callouts, and toggles are added from the slash menu. Covers the block rules and table cells in `@quire/markdown`, the helper's `readAsset` and `writeAsset`, the app's asset store, and the block views.

## Current verified status

**Status:** Planned

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
- Callouts, toggles, and tables are multi-line blocks: clicking one edits its source, as code blocks do. Clicking a toggle's summary only opens or closes it.

## Related blueprints

### Required

- [page-rendering](page-rendering.md): the block views and inline rendering this extends.
- [slash-menu](slash-menu.md): the commands that add rich blocks.

### Impact checks

- [page-editing](page-editing.md): check when multi-line editing or the edit path changes.
- [native-helper](native-helper.md): check when helper methods or size limits change.
- [auto-sync](auto-sync.md): check when asset files change, since sync commits them.

## Relevant implementation and tests

- `packages/markdown/src/{blocks,table,links,edit}.ts`, `packages/markdown/tests/rich.test.ts`
- `helper/src/{assets,base64,host}.rs`, with unit tests
- `apps/extension/src/app/assetStore.ts`, `apps/extension/src/app/blocks/{RichBlocks,BlockView,PageEditor}.tsx`, `apps/extension/src/shared/slash.ts`
- `apps/extension/e2e/rich-blocks.spec.ts`

## Acceptance or verification criteria

- [ ] An image in the page's `assets/` folder, a Warning callout with bold text, a toggle with a to-do inside, and a table with a right-aligned column render formatted.
- [ ] `/table` adds a table and the typing goes into its first body cell.
- [ ] An image file dropped between two blocks is saved into `assets/` and its line is written there.

## Remaining gaps and unknowns

- Tables are edited as source; there is no cell-by-cell editing, and rows and columns cannot be added from a menu.
- Toggle bodies are edited as source together with the summary.
- Images inside a line of text stay as text; only a line that is only an image becomes an image block.
- An image replaced on disk while its page is open keeps showing the old picture until Quire is reopened, since the watcher ignores `assets` folders.
- Images cannot be resized or captioned from Quire; the title in `![alt](path "title")` is shown as the caption.
