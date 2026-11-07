# Block keys and shortcuts

## Outcome or responsibility

Writing feels like Notion rather than like a Markdown file: the block being edited looks like itself (a heading stays large, a list item keeps its bullet or number, a to-do keeps its checkbox) with no Markdown marks in the text, typing a shortcut at the start of a line changes the block's type, and Tab, Backspace, Enter, and the arrow keys act on blocks. Covers the marker split and shortcuts in `@quire/markdown` and the editing view and keys in the page editor.

## Current verified status

**Status:** Partial

Code, Markdown unit tests, and end-to-end tests are written for slice 8. Not yet verified by CI or by hand in Chrome.

## Architecture dependencies

- [Block model and line mapping](../architecture.md#block-model-and-line-mapping): the marker split while editing, and edits that touch only their own lines.

## Local rules and implications

- Marker split (`packages/markdown/src/prefix.ts`): `splitLine` returns the kind, the marker with its indentation (`prefix`), and the text. A marker counts only when a space or tab follows it, so typing `-5` or `#tag` never flashes a list or heading. Dividers and multi-line text have no marker.
- Shortcuts at the start of a plain line, applied as the space after them is typed: `#` to `######` make headings, `-`, `*`, or `+` a bullet, `1.` or `1)` a numbered item, `>` or `"` a quote, `[]`, `[ ]`, or `[x]` a to-do (written as `- [ ] `), and `---` a divider followed by a new empty line. The ones Markdown already covers need no rewrite; the line is parsed again.
- A `# ` heading typed above the title, or on a page without one, becomes the page title, and the caret moves into the title.
- Keys in a one-line block:
  - Enter at the start of a non-empty heading or quote opens an empty line above it; Enter in an empty heading or quote turns it into plain text.
  - Backspace at the start of a block with a marker removes the marker and indentation; at the start of plain text it joins the line to the one before.
  - Tab nests a list item under the list item before it (indented to line up with that item's text); Shift+Tab moves it one level out. Tab never leaves the editor; Escape does.
  - Ctrl+Enter (Cmd+Enter on macOS) checks or unchecks a to-do.
  - Up and Down keep the caret at the same offset in the text, not counting markers.
- Placeholders in empty blocks name the block type (**Heading 2**, **List**, **To-do**, **Quote**); an empty plain line lists the main shortcuts.
- The checkbox of the to-do being edited toggles without taking focus from the text.

## Related blueprints

### Required

- [page-editing](page-editing.md): the editing model, saving, and the caret rules this builds on.
- [page-rendering](page-rendering.md): formatted blocks, bullets, and list numbering.

### Impact checks

- [page-editing](page-editing.md): check when splitting, joining, or caret mapping changes.

## Relevant implementation and tests

- `packages/markdown/src/prefix.ts`, `packages/markdown/tests/prefix.test.ts`
- `packages/markdown/src/edit.ts` (`splitBlock`, `clearPrefix`, `indentItem`, `insertDivider`), `packages/markdown/tests/edit.test.ts`
- `apps/extension/src/app/blocks/PageEditor.tsx`
- `apps/extension/e2e/blocks.spec.ts`

## Acceptance or verification criteria

- [ ] Typing `## `, `- `, `[] `, `" `, and `---` at the start of a line produces a heading, a bullet, a to-do, a quote, and a divider, saved as standard Markdown.
- [ ] The text box of a heading, list item, or to-do holds only its text, with the marker drawn.
- [ ] Ctrl+Enter checks a to-do; Enter on an empty list item ends the list.
- [ ] Tab and Shift+Tab nest and un-nest a list item.
- [ ] Backspace at the start of a heading makes it plain text, and a second Backspace joins it to the line before.
- [ ] Up and Down keep the caret at the same place in the text across blocks with markers of different widths.

## Remaining gaps and unknowns

- Shortcuts apply only to plain lines; typing `# ` inside a list item does not turn it into a heading.
- Plain paragraphs cannot be nested with Tab, because Markdown has no indented paragraph outside a list.
- Undo is still the text box's own; an edit that changes the block type starts a new text box.
