# Inline formatting

## Outcome or responsibility

Selecting words in the block being edited shows a small toolbar above them, like Notion: Bold, Italic, Strikethrough, Code, and Link, each showing whether the selection already has it. The buttons and the usual shortcuts add or remove the Markdown delimiters around the selection, so the file stays standard Markdown that reads the same on GitHub. Covers the formatting edits in `@quire/markdown` and the toolbar and shortcuts in the page editor.

## Current verified status

**Status:** Planned

## Architecture dependencies

- [Block model and line mapping](../architecture.md#block-model-and-line-mapping): formatting rewrites only the edited line, and the inline syntax is the one the renderer reads.

## Local rules and implications

- Inline spans come from one scanner (`scanInline` in `packages/markdown/src/inline.ts`) that records where each node and its content sit in the source; `parseInline` is the same scan without the ranges, so the toolbar and the renderer never disagree about what is styled.
- A command first narrows the selection: spaces at its ends are left out, a selection that starts or ends inside a delimiter takes the whole delimiter, and a selection of a whole styled run means its content.
- A style is on when a span of that style holds the whole selection. Turning it off removes the delimiters only around the selected part: `**one two three**` with `two` selected becomes `**one** two **three**`. Turning it on wraps the selection, first widening it so it never cuts through another span.
- Delimiters: bold `**`, italic `*`, strikethrough `~~`, code with a backtick fence longer than any backtick run inside. Next to an asterisk, bold and italic use `__` and `_`, so nested styles such as `**_word_**` still parse.
- At a caret, a shortcut inserts an empty pair with the caret inside, the same shortcut on an empty pair removes it, and inside a styled run it moves the caret past the closing delimiter, so typing goes on unstyled.
- Inside inline code only Code can be turned off; the other buttons are disabled.
- Shortcuts (Cmd instead of Ctrl on macOS): Ctrl+B bold, Ctrl+I italic, Ctrl+Shift+X (or Ctrl+Shift+S) strikethrough, Ctrl+E code, Ctrl+K link.
- Link (button or Ctrl+K, with a selection or a caret inside a link) replaces the buttons with an address field filled with the current address. Enter applies; `example.com` becomes `https://example.com` and `me@site.org` becomes `mailto:me@site.org`, and relative addresses are kept. Addresses with spaces or unbalanced parentheses are written in angle brackets. An empty address or **Remove** unlinks and keeps the label; `<url>` and bare URLs cannot be unlinked. Escape returns to the text with the selection kept.
- Focus stays in the text box: the toolbar takes no focus on click, and leaving the address field for anything but the toolbar or the text box closes the editor. The toolbar is shown for one-line blocks only, never while the slash menu is open.

## Related blueprints

### Required

- [block-keys](block-keys.md): the editing view, marker split, and keys this sits on.
- [page-rendering](page-rendering.md): how inline styles and links render and which links open.

### Impact checks

- [page-rendering](page-rendering.md): check when the inline scanner changes.
- [slash-menu](slash-menu.md): check when the editing block's popups change.

## Relevant implementation and tests

- `packages/markdown/src/format.ts`, `packages/markdown/tests/format.test.ts`
- `packages/markdown/src/inline.ts` (`scanInline`), `packages/markdown/tests/inline.test.ts`
- `apps/extension/src/app/blocks/{PageEditor,FormatToolbar}.tsx`, `apps/extension/src/app/blocks/caretPoint.ts`
- `apps/extension/e2e/inline.spec.ts`

## Acceptance or verification criteria

- [ ] Selecting a word shows the toolbar; Bold saves `**word**` and shows Bold as on, and the text box keeps focus and the selection.
- [ ] Ctrl+I on bold text saves `**_word_**`, and Bold then saves `_word_`.
- [ ] Turning a style off for part of a styled run keeps it on the rest.
- [ ] Ctrl+K opens the address field; `example.com` and Enter save `[word](https://example.com)`, and Remove restores the plain word.
- [ ] Ctrl+B at a caret, typing, and Ctrl+B again saves `**x**` and continues unstyled; Ctrl+Shift+X strikes a selection.

## Remaining gaps and unknowns

- The title and multi-line blocks (code, tables) get no toolbar.
- The toolbar is placed above the start of the selection and is not moved back into view near the top edge of the page.
- Text colors and highlights have no standard Markdown form and are not offered.
