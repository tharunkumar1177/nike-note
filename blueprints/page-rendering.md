# Page rendering

## Outcome or responsibility

Opening a page shows its `README.md` body as read-only blocks, laid out the way Notion lays out a page: the first `# ` heading becomes the page title, every other line becomes a block with inline formatting, sub-page link lines become page blocks, and links are safe to click. Covers the helper's `readPage`, the shared page path check, the `@quire/markdown` package, and the app's body store and block views.

## Current verified status

**Status:** Partial

Code, unit tests, and end-to-end tests are written for slice 5. Not yet verified by CI or by hand in Chrome.

## Architecture dependencies

- [Block model and line mapping](../architecture.md#block-model-and-line-mapping): `readPage`, block boundaries, byte-exact round trips, list nesting, the title block, and link handling.
- [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety): page paths and the errors for paths outside the notes folder.
- [Page structure](../architecture.md#page-structure): the title rule and link-line forms shared with the page tree.
- [Native messaging protocol](../architecture.md#native-messaging-protocol): the 1 MiB reply limit behind the 512 KiB body limit, and the `TOO_LARGE`, `OUTSIDE_ROOT`, and `NOT_FOUND` codes.

## Local rules and implications

- Rule ownership: block and inline syntax live only in `packages/markdown`. The app never matches Markdown with its own regular expressions; it renders the parsed blocks.
- The parser never throws and never drops text. Anything it does not recognize is a text block that shows its source, so every file round-trips byte for byte. A seeded random test checks the round trip.
- Inline parsing (`src/inline.ts`) handles escapes, code spans, `**bold**`, `*italic*` and `_italic_`, `~~strike~~`, `[links](url)`, `<autolinks>`, and bare `http(s)://` URLs. Emphasis nests at most 16 levels. Images stay as text until slice 13.
- Page link blocks show the sub-page's current title from the page tree, falling back to the link text, so a renamed heading shows up without rewriting the parent.
- The page title is the only `h1`. Body headings render one HTML level below their Markdown level (`##` as `h3`), capped at `h6`, while their styling follows the Markdown level.
- Numbered items show a running count from the first item of each run, as Markdown renderers do, and keep their source number in the file.
- The app renders with React elements only (no `innerHTML`), so Markdown cannot inject markup or script.
- Body loading (`src/app/pageBodyStore.ts`): a response for a page that is no longer open is ignored. Reloading the open page keeps the old body on screen until the new one arrives. The body reloads with the tree when the tab becomes visible.
- Tables and front matter show their source (front matter collapsed under **Properties**) until slice 13 adds table editing.
- The **Sub-pages** list shows only child pages that the body does not already link, after the body has loaded.

## Related blueprints

### Required

- [page-tree](page-tree.md): the open page, its trail, and its children come from the tree.

### Impact checks

- [native-helper](native-helper.md): check when the request loop or error codes change.
- [build-pipeline](build-pipeline.md): check when a workspace package is added or the lockfile flow changes.

## Relevant implementation and tests

- `packages/markdown/src/{lines,links,blocks,inline,index}.ts`, with `packages/markdown/tests/`
- `helper/src/paths.rs`: page path check, with unit tests
- `helper/src/pages.rs`: `read_page`, with unit tests
- `apps/extension/src/shared/pageBody.ts`, `apps/extension/src/app/pageBodyStore.ts`
- `apps/extension/src/app/blocks/{BlockList,InlineView}.tsx`, `apps/extension/src/app/PageView.tsx`
- `apps/extension/e2e/rendering.spec.ts`

## Acceptance or verification criteria

- [ ] Every block type in [plan.md](../plan.md#block-mapping) up to slice 5 renders: headings, quotes, bulleted, numbered, and to-do lists with nesting, dividers, code with its language, page links, tables and front matter as source.
- [ ] The first `# ` heading is the page title and is not repeated in the body.
- [ ] Web links open in a new tab without a referrer, page links open in Quire, and other links are inert.
- [ ] Unedited files round-trip byte for byte, including the byte order mark and `\r\n` line endings.
- [ ] Paths outside the notes folder are refused, and pages over 512 KiB show an explanation.

## Remaining gaps and unknowns

- Pages over 512 KiB cannot be opened; a chunked read is not designed yet.
- Reference-style links, footnotes, and inline HTML show as text.
