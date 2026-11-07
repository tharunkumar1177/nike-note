# Block handle

## Outcome or responsibility

Hovering a block shows a six-dot handle in the left margin, like Notion. Dragging the handle moves the block, and clicking it opens a menu that turns the block into another type, duplicates it, moves it up or down, indents or outdents a list item, or deletes it. While a block is being edited, Ctrl+Shift+Up and Ctrl+Shift+Down move it and Ctrl+D duplicates it. Every action rewrites whole source lines, so the file stays plain Markdown. Covers the block arranging edits in `@quire/markdown` and the handle, menu, dragging, and shortcuts in the page editor.

## Current verified status

**Status:** Implemented

Verified in CI (Markdown unit tests for block groups, moves, the title boundary, line endings, duplicate, delete, and unwrapping code; end-to-end tests for every criterion below) and by hand in Chrome on Windows with the CI build: on a CRLF page, the menu turned a line into Heading 2 and moved a list item up past a nested item, End and Escape moved focus as described, a real mouse drag put the last block under the title with the drop line shown, and Ctrl+Shift+Up and Ctrl+D carried a nested item along and kept typing in place, with CRLF endings kept throughout.

## Architecture dependencies

- [Block model and line mapping](../architecture.md#block-model-and-line-mapping): a block moves as its group of source lines, and the title and front matter never move.

## Local rules and implications

- A block's group is the block plus, for a list item, every deeper list item right after it, so a parent always moves, duplicates, and is deleted with its nested items.
- Move down puts the group after the next group. Move up puts it before the nearest earlier block that is not nested deeper than it, so it skips over the previous sibling's children instead of landing inside them. Nothing moves above the title or front matter.
- A moved or duplicated last line gets the page's line ending, so CRLF pages stay CRLF.
- Delete puts the caret at the end of the block before. Duplicate and the move shortcuts keep the caret at the same place in the copy or the moved block.
- Turn into offers text, headings 1 to 3, the three list types, quote, and code for one-line blocks, and only Text for a code block, which turns its lines back into plain text lines. Dividers, page links, tables, and front matter only arrange.
- The menu takes focus on its first item, moves with the arrow keys, Home, and End, and closes on a choice, Escape (focus goes back to the handle), Tab, or a click outside. Indent and Outdent are offered for list items only.
- Dragging shows a line before or after the block under the pointer, depending on which half the pointer is over, and the dragged block is dimmed. Dropping above the first body block puts the block right after the title.
- Shortcuts use Cmd instead of Ctrl on macOS.

## Related blueprints

### Required

- [block-keys](block-keys.md): the editing view, marker split, and list nesting this reuses.
- [slash-menu](slash-menu.md): the turn-into edit the menu shares.

### Impact checks

- [page-editing](page-editing.md): check when the edit path or caret mapping changes.
- [inline-formatting](inline-formatting.md): check when editing shortcuts change.

## Relevant implementation and tests

- `packages/markdown/src/edit.ts` (`blockGroup`, `moveBlock`, `moveBlockBy`, `duplicateBlock`, `deleteBlock`, `unwrapCode`), `packages/markdown/tests/edit.test.ts`
- `apps/extension/src/app/blocks/{PageEditor,BlockHandle}.tsx`
- `apps/extension/e2e/block-handle.spec.ts`

## Acceptance or verification criteria

- [x] The menu turns a line into Heading 2, duplicates it, moves a block up, and deletes a block chosen with End and Enter; Escape returns focus to the handle.
- [x] Moving a list item up carries its nested items with it, and Indent nests an item.
- [x] Dragging a block's handle onto the top half of another block moves it before that block.
- [x] Ctrl+Shift+Up and Ctrl+Shift+Down move the block being edited and Ctrl+D duplicates it, with typing going on at the same place.

## Remaining gaps and unknowns

- The block being edited shows no handle; it can be moved with the shortcuts, or after clicking away.
- Dragging works with a mouse only; keyboard users use the menu or the shortcuts.
- Blocks cannot be dragged into another page in the tree.
- Table rows and columns cannot be rearranged from the handle.
