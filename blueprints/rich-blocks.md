# Rich blocks

## Outcome or responsibility

Pages show images, callouts, toggles, tables, and equations the way Notion does, while the file stays Markdown that GitHub renders the same way. An equation is TeX between `$$` lines, on one `$$…$$` line, or in a ```` ```math ```` fence, and is drawn with KaTeX as its own block, never as a code block: clicking it opens a small editor under it where the TeX is typed and the equation redraws as it changes. Inline math is `$…$` inside text. An image is a line that is only `![alt](path)`, or only the `<img>` HTML GitHub uses for a sized or aligned image, and its file lives in the page's `assets/` folder. An image is edited like a Notion image: clicking selects it, handles on its sides resize it, and a toolbar aligns it left, center, or right, adds a caption, and opens a menu for alt text, replacing the file, downloading, going back to the original size, and deleting. A callout is a GitHub alert (`> [!NOTE]` followed by `>` lines). A toggle is a `<details>` block with a `<summary>` line. A table is a GitHub table with aligned columns, edited like a Notion table: clicking a cell edits that cell, the keyboard moves between cells, the + bars at the right and bottom add a column or a row, and handles on each row and column open menus to insert, move, align, and delete. Images are added with `/image`, by pasting, or by dropping files on the page; tables, callouts, toggles, and equations (`/equation`) are added from the slash menu. Covers the block rules, image lines, math forms, and table cells and edits in `@quire/markdown`, the helper's `readAsset` and `writeAsset` and image sources in link rewriting, the app's asset store, the KaTeX loader, the block views, and the table, image, and equation editors.

## Current verified status

**Status:** Implemented

Verified in CI (Markdown unit tests for image, callout, and toggle rules, table cells, templates, and file links; helper unit tests for base64, chunked reads, path refusals, and unique image names on Windows, macOS, and Linux; end-to-end tests for every criterion below) and by hand in Chrome on Windows with the CI build: on a CRLF page with a byte order mark, a 600 KiB image read in two chunks showed with its caption, a Tip callout, a toggle that opened without entering editing and kept its to-do read-only, and a table with left and right columns rendered, and a PNG dropped between two lines was saved byte for byte and its line written there, with the endings kept. Table editing is verified in CI (Markdown unit tests for cell, row, column, and alignment edits, escaping, and rewriting only changed rows; end-to-end tests for typing in cells, Tab, Enter, and the arrow keys, the + bars, and every row and column menu action) and by hand in Chrome on Windows with the CI build on a CRLF page with a byte order mark: a cell edited in place, Tab past the last cell adding a row, the + bar adding a column, Align right, and Delete row, with the byte order mark and CRLF endings kept. Hand testing found a stray vertical scrollbar beside tables and handles hidden while their own menu was open; both are fixed. Image editing is verified in CI (Markdown unit tests for reading and writing both image forms, refusing HTML it cannot write back, and the empty line after HTML; a helper unit test for rewriting `<img src>` after a page move; end-to-end tests for selecting, aligning, mouse and keyboard resizing, captions, Original size, Enter, the arrow keys, Backspace, alt text, Replace image, and a hand-written right-aligned image) and by hand in Chrome on Windows with the CI build on a CRLF page with a byte order mark: a 480-pixel image selected without showing its source, centered, dragged to 320 pixels, captioned, given alt text, a line added under it after the empty line, then aligned left and dragged to 140 pixels, with the byte order mark and CRLF endings kept. Hand testing found the page's focus ring drawn around the whole width of a selected image, Enter putting the new line between an HTML image and its empty line, and the toolbar covering small images; all three are fixed. Equations are verified in CI (Markdown unit tests for the three block forms, the text fallbacks, choosing the form on write-back, `setMath` on CRLF pages, inline math rules, and the Equation mark; a build test that fails if KaTeX reaches the startup chunk; end-to-end tests for clicking, editing, invalid TeX, `/equation`, the selected-equation keys, Ctrl+Shift+E, and typing `$$x$$`) and by hand in Chrome on Windows with the CI build on a CRLF page with a byte order mark: inline math, a `math` fence, and a `$$` block holding the Cauchy–Schwarz inequality rendered, `$5 and $10` stayed text, invalid TeX showed KaTeX's message, an edit redrew and saved, `/equation` added `$$` lines, and the toolbar's Equation button wrapped a selection in `$…$`, with the byte order mark and CRLF endings kept. Hand testing found long TeX scrolling inside a one-line box; the box now grows with its wrapped lines.

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
- Image lines (`image.ts`): the HTML form is read only when the whole line is `<img>` with a non-empty `src` and at most `alt`, `title`, and a `width` of 1 to 9999 whole pixels, in double or single quotes, optionally inside `<p align="left|center|right">…</p>`; anything else (`height`, `style`, `width="50%"`, a lone `<p>`) stays text, so Quire never drops what it cannot write back. Character references in values are decoded and written back escaped.
- Images are always shown as pictures (`ImageEditor`); clicking selects one (the caret sits on its line) instead of showing its source. While selected, Enter adds an empty line below and edits it (under an image written as HTML, after the empty line that ends the HTML, adding that line if it is missing), Backspace or Delete removes the image, the arrow keys move to the block before or after, and Escape deselects.
- Resizing: the side handles appear on hover or selection. A drag saves the width when the pointer is released; a centered image grows on both sides, so it changes twice as fast. Widths are kept between 48 pixels (or the current width, if smaller) and the page width. A focused handle takes Left and Right (16 pixels, 64 with Shift). **Original size** removes the width.
- Toolbar and menu: Align left, Align center, and Align right; Caption edits the title under the image as it is typed (Enter or Escape finishes); the menu offers Alt text, Replace image (saves the new file into `assets/` like a new image, keeps size, alignment, and caption, and leaves the old file), Download, Original size, and Delete image. Menus and the alt text form open in the top layer. The toolbar sits on the image's top-right corner, or above it when the image is narrower than 240 or shorter than 96 pixels, so it never covers a small picture.
- An image at its own size on the left is written back as `![alt](src "title")`; any width or another alignment writes the HTML form, with an empty line added after it when the next line has text, because GitHub keeps reading HTML until an empty line.
- Equation forms (`math.ts`): a `$$` line opens an equation that ends at the next `$$` line; if an empty line or the end of the file comes first, the line stays text, as on GitHub. `$$…$$` alone on a line with non-blank TeX and no `$` is the one-line form, and a fence whose language is `math` (any case, backticks or tildes) is the fence form. Write-back keeps the form the equation had when editing began, falling back to `$$` lines when one-line no longer fits and to a fence (longer than any backtick run in the TeX) when the TeX holds an empty line, a `$$` line, or a fence line.
- Inline math follows GitHub's rules: `$…$` cannot start or end with a space, and the closing `$` is not escaped, doubled, or followed by a digit, so prices stay text; `` $`…`$ `` is also read. `$$` inside a line stays text. Text inside math is not styled; the Equation mark (Ctrl+Shift+E or the toolbar's √x) wraps the selection, using the backtick form when the TeX would break the plain one, and removing it unwraps the whole equation.
- KaTeX loads lazily, in its own chunk with its styles and fonts, the first time a page shows math; the build fails if it reaches the startup chunk. TeX is rendered with `trust` off (no links, classes, or HTML from TeX), size and macro expansion limits, and both HTML and MathML output; the 256 most recent results are cached. Invalid TeX shows in red with KaTeX's message as its tooltip.
- Equations are always drawn (`MathEditor`). Clicking one selects it and opens the TeX editor in the top layer under it, or above it when there is no room below; Shift+Enter adds a line, and Enter, Escape, or Done closes the editor and leaves the equation selected. While selected, Enter opens the editor, Backspace or Delete removes the equation, the arrow keys move to the block before or after (Down on the last block starts a new line), and Escape deselects. An empty equation shows **Add a TeX equation**. `/equation` and typing a line that becomes an equation open the editor at once.

## Related blueprints

### Required

- [page-rendering](page-rendering.md): the block views and inline rendering this extends.
- [slash-menu](slash-menu.md): the commands that add rich blocks.

### Impact checks

- [page-editing](page-editing.md): check when multi-line editing or the edit path changes.
- [native-helper](native-helper.md): check when helper methods or size limits change.
- [auto-sync](auto-sync.md): check when asset files change, since sync commits them.

## Relevant implementation and tests

- `packages/markdown/src/{blocks,table,image,math,inline,format,links,edit}.ts`, `packages/markdown/tests/{rich,table,image,math}.test.ts`
- `apps/extension/src/app/blocks/{TableEditor,ImageEditor,MathEditor,MathFormula,PopoverMenu}.tsx`, `apps/extension/e2e/{tables,images,math}.spec.ts`
- `apps/extension/src/app/math/{katex,mathStore}.ts`, `apps/extension/src/build/plugin.ts`, `apps/extension/tests/build.test.ts`
- `helper/src/{assets,base64,host,relink}.rs`, with unit tests
- `apps/extension/src/app/assetStore.ts`, `apps/extension/src/app/blocks/{RichBlocks,BlockView,PageEditor}.tsx`, `apps/extension/src/shared/slash.ts`
- `apps/extension/e2e/rich-blocks.spec.ts`

## Acceptance or verification criteria

- [x] An image in the page's `assets/` folder, a Warning callout with bold text, a toggle with a to-do inside, and a table with a right-aligned column render formatted.
- [x] `/table` adds a table and the typing goes into its first body cell.
- [x] An image file dropped between two blocks is saved into `assets/` and its line is written there.
- [x] Clicking a table cell edits only that cell; Tab, Shift+Tab, and the arrow keys move between cells and out of the table, and Tab in the last cell adds a row.
- [x] The + bars add a column and a row; the column menu aligns, moves, and deletes columns, and the row menu moves and deletes rows; the file changes only in the rows edited.
- [x] Clicking an image selects it without showing its source; the toolbar aligns it and adds a caption, dragging or arrowing a side handle resizes it, and Original size and Align left write it back as `![alt](path "title")`.
- [x] A selected image takes Enter (new line below), the arrow keys, and Backspace (delete), on a CRLF page.
- [x] The image menu edits alt text and replaces the file while keeping the width and alignment; a hand-written right-aligned `<img>` renders at its width on the right.
- [x] After a page move, an `<img src>` pointing into the moved page is rewritten.
- [x] Inline `$…$`, a `math` fence, and a `$$` block render as equations, not code, and `$5 and $10` stays text.
- [x] Clicking an equation opens its TeX editor; edits redraw and save in the equation's form, and invalid TeX shows KaTeX's message.
- [x] `/equation` adds `$$` lines and opens the editor; a selected equation takes Enter, the arrow keys, and Backspace on a CRLF page.
- [x] Ctrl+Shift+E wraps the selection in `$…$`, and typing `$$x$$` on a line turns it into an equation.
- [x] KaTeX is not in the startup chunk.

## Remaining gaps and unknowns

- Table columns cannot be resized and rows and columns cannot be dragged; moving uses the menus. Several cells cannot be selected at once, and pasting a spreadsheet range goes into one cell.
- Toggle bodies are edited as source together with the summary.
- Images inside a line of text stay as text; only a line that is only an image becomes an image block.
- An image replaced on disk while its page is open keeps showing the old picture until Quire is reopened, since the watcher ignores `assets` folders.
- An image's caption is its title, which GitHub shows only as a tooltip, not under the image. Captions are plain text.
- Images cannot be dragged to resize by height or cropped, and several images cannot sit side by side in one row.
- Replacing an image leaves the old file in `assets/`; nothing deletes unused asset files.
- `$$…$$` inside a line of text stays text; only a line that is only an equation becomes a block. Equations have no numbering, and `\tag` is passed to KaTeX as typed.
- Quire draws with KaTeX and GitHub with MathJax, so rare commands either supports alone show differently on GitHub. KaTeX's fonts add about 1 MB to the extension, loaded only when math is shown.
- Text typed onto the empty line right under a sized or aligned image, or a line moved there, is read by GitHub as part of the image's HTML (shown without Markdown formatting) until the next empty line. Quire keeps that empty line when it writes the image and when Enter adds a line, but does not stop other edits from filling it.
