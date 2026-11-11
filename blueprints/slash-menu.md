# Slash menu

## Outcome or responsibility

Typing `/` in a line opens a menu of block types, like Notion: the text typed after it narrows the list, and choosing an item turns the line into that block or adds a sub-page linked from the line. Covers the command list and its matching, the menu in the page editor, the turn-into and link-line edits in `@quire/markdown`, and the helper's `createPage`.

## Current verified status

**Status:** Implemented

Verified in CI (helper unit tests for folder naming, unique names, and `createPage` on Windows, macOS, and Linux; Markdown and app unit tests for turn-into, link lines, and command matching; end-to-end tests for every criterion below) and by hand in Chrome on Windows with the CI build: on a CRLF page, `/h3`, `/to` with Tab, the arrow keys (wrapping both ways), Escape, and `/pag` with Enter produced a heading, a to-do that kept its words, an untouched `/`, and a linked **Untitled** sub-page that opened at once, with CRLF endings kept.

## Architecture dependencies

- [Block model and line mapping](../architecture.md#block-model-and-line-mapping): turn-into edits rewrite only their own line, and dividers never sit right under text.
- [Page structure](../architecture.md#page-structure): `createPage`, folder naming, and the link-line form the page tree reads.
- [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety): the parent page path is checked like every page path.

## Local rules and implications

- The menu opens when `/` is typed at the start of a one-line block or after a space. It stays open while the text after the `/` matches a command; a space, a query nothing matches, Escape, the caret leaving the block, or choosing an item closes it. Closing never removes text.
- Commands (22): Text, Heading 1 to 6, Bulleted list, Numbered list, To-do list, Quote, Code, Divider, Table, Callout, Toggle, Block equation, Inline equation, Image, Visual, Page, and Write with AI. Each is found by its slash name (`/text`, `/h1` to `/h6`, `/bullet`, `/numbered`, `/todo`, `/quote`, `/code`, `/divider`, `/table`, `/callout`, `/toggle`, `/math`, `/inlinemath`, `/image`, `/visual`, `/page`, `/ai`), by its label without case or spaces (`/heading2`, `/inlineequation`), and by keywords (`/list`, `/hr`, `/equation`, `/latex`, `/inline`, `/diagram`, `/html`, `/write`, `/generate`).
- Inline equation works anywhere a `/` opens the menu, including after a space in the middle of a line: it puts `$$` there with the caret between the two signs, so the TeX typed next becomes inline math once the line is left. Exact names come first, then names that start with the query, then names that contain it; otherwise menu order holds.
- Focus stays in the text box. Up and Down move the highlight and wrap, Enter or Tab chooses, the pointer highlights and a click chooses without taking focus. The text box points at the menu with `aria-controls` and at the highlighted option with `aria-activedescendant`.
- Choosing removes the `/` and the query, then (`turnInto`) replaces the line's marker and keeps its words and caret place. A list item keeps its indentation only when it becomes another list kind. Code wraps the words in a fenced block with the page's line endings. Divider replaces an empty line and opens a new line after it; after a line with words it adds a blank line, the divider, and a new line, so the text never reads as a setext heading on GitHub. A level-1 heading that becomes the page's title moves the caret into the title.
- Page removes the command, asks the helper for a sub-page titled **Untitled** under the open page, waits until the page tree shows it, puts the link line on the command's line (or on a new line after it when the line has words), and opens the new page. The link is written into the latest text, so typing during the request is kept. A failure shows an inline message and leaves the page unchanged apart from the removed command.
- Write with AI removes the command and opens the Write with AI dialog for that line (see [ai-assist](ai-assist.md)); Visual does the same with **Add a visual** (see [visual-blocks](visual-blocks.md)); the rich-block commands are covered in [rich-blocks](rich-blocks.md).

## Related blueprints

### Required

- [block-keys](block-keys.md): the marker split, typing path, and keys the menu sits on.
- [page-tree](page-tree.md): link lines and tree reloads after a page is created.

### Impact checks

- [page-editing](page-editing.md): check when the editor store's edit path or caret mapping changes.
- [native-helper](native-helper.md): check when helper methods or error codes change.
- [ai-assist](ai-assist.md): check when `/ai` or the line it hands to Write with AI changes.

## Relevant implementation and tests

- `apps/extension/src/shared/slash.ts`, `apps/extension/tests/slash.test.ts`
- `apps/extension/src/app/blocks/{PageEditor,SlashMenu}.tsx`, `apps/extension/src/app/{pageEditorStore,pageTreeStore}.ts`, `apps/extension/src/app/{PageView,Workspace}.tsx`
- `packages/markdown/src/edit.ts` (`turnInto`, `insertLinkLine`), `packages/markdown/src/links.ts` (`pageLinkLine`), `packages/markdown/tests/{edit,links}.test.ts`
- `helper/src/pageops.rs`, `helper/src/host.rs` (`createPage`)
- `apps/extension/e2e/slash.spec.ts`

## Acceptance or verification criteria

- [x] Typing `/` on an empty line lists all 22 commands; typing `h2` highlights Heading 2 first, and Enter makes the line a level-2 heading saved as `## `.
- [x] Every roadmap command (`/h1` to `/h6`, `/quote`, `/bullet`, `/numbered`, `/todo`, `/code`, `/divider`, `/text`, `/page`) is the first match for its name.
- [x] Choosing an item keeps the words already on the line; the arrow keys move the highlight, Tab chooses, and a click chooses without losing focus.
- [x] Escape, a space, and a query with no match close the menu and keep the typed text.
- [x] `/page` creates a folder with `README.md` titled Untitled, writes `[Untitled](Untitled/README.md)` on the line, and opens the new page.
- [x] Folder names from titles are valid on Windows, macOS, and Linux and never collide with an existing folder, regardless of case.

## Remaining gaps and unknowns

- The new page is always titled Untitled; its folder follows the title once it is renamed (see [page-operations](page-operations.md)).
- The menu opens below the line and can run past the bottom of the window on the last lines of a long page.
- The slash menu turns only one-line blocks; a code block is turned back into text from its block handle menu (see [block-handle](block-handle.md)), and tables cannot change type.
