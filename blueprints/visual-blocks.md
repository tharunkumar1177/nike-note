# Visual blocks

## Outcome or responsibility

A page can hold interactive visuals that explain a concept, such as Git merge versus rebase drawn as a commit graph with a button that steps through each operation. A visual is a self-contained HTML document saved in the page's `assets/` folder; the page holds only one link line to it, `[Git merge vs rebase](assets/Git%20merge%20vs%20rebase.html)`, which GitHub shows as a link. Quire runs the HTML live inside the extension's sandbox page, sized to its content. `/visual` opens **Add a visual**, where the HTML is generated with AI from a description, pasted, or uploaded, previewed running, and inserted. Covers the Visual line rule in `@quire/markdown`, the sandbox page, its policy, and its loader, the asset store's visual reads and saves, the block view, the dialog, and the visual prompt.

## Current verified status

**Status:** Partial

Verified in CI (Markdown unit tests for the line rule and round trips; extension unit tests for the sandbox policy, the sandbox page, messages, heights, the manifest, the visual prompt, and cleaning generated HTML; helper unit tests for reading and saving HTML assets on Windows; end-to-end tests for every criterion below, including the real Gemini SDK against the real API with an invalid key). Not yet checked by hand in Chrome with the CI build.

## Architecture dependencies

- [Visual blocks](../architecture.md#visual-blocks): the line form this block reads and writes, the 1 MiB limit, the sandbox page and its policy, and the message exchange the view and the loader implement.
- [Page assets](../architecture.md#page-assets): visuals are read in chunks with `readAsset` and saved as new, uniquely named files with `writeAsset`, like images.
- [Block model and line mapping](../architecture.md#block-model-and-line-mapping): the Visual block is a one-line block; inserting one changes only the line it goes on.
- [AI providers](../architecture.md#ai-providers): generation goes through the provider registry with the saved key, and the result enters the page only on Insert.

## Local rules and implications

- Rule ownership: the Visual line rule and the line writer live in `packages/markdown/src/visual.ts`; the parser checks it after images and before sub-page links, so `[Child](child/README.md)` stays a page block.
- The sandbox page is emitted by the build plugin, not by Vite's HTML pipeline: its loader is a fixed plain-JavaScript string inlined into the page (`src/shared/visual.ts`), because a module script would be fetched across origins from the sandbox's opaque origin, and bundler helpers would not exist inside it.
- The view (`VisualBlock.tsx`) answers only the frame's own `ready` message, ignores every message whose source is not that frame, and remounts the frame when the HTML or the app's light or dark scheme changes, so a visual starts again from its first state. The scheme is the forced theme from Settings, or the system's.
- The block shows a bar with the title (the file name when the title is empty) and **Reload**, which reads the file again from disk; clicking the bar elsewhere edits the link line like any other block, and clicks inside the visual stay in the visual. The 16 most recently used visuals stay loaded as text.
- `/visual` removes the command and opens the dialog for that line. **Generate with AI** is the default source; without saved AI settings it offers **Set up AI** and returns to the dialog afterwards. **Paste HTML** previews 500 ms after typing stops; **Upload file** accepts `.html` and `.htm` up to 1 MiB and fills an empty title from the file name. Insert is enabled once there is HTML: generated HTML only after the answer finishes and holds a tag. The title defaults to the AI request, then `Visual`.
- On Insert the HTML is saved as `<title>.html` (cleaned and made unique by the helper) and the link line goes on the line where `/visual` was typed when it is empty, otherwise after its block. Saving fails with a message in the dialog, which stays open.
- The visual prompt (`visualPrompt` in `src/shared/ai.ts`) asks for one complete document starting with `<!doctype html>`, inline CSS and JavaScript only, no network, forms, alerts, or windows, widths from 360 to 900 pixels, under 900 pixels tall, no `vh` units, and light and dark schemes. `cleanVisualHtml` removes a fence around the answer and words before the document.

## Related blueprints

### Required

- [rich-blocks](rich-blocks.md): the asset store and the `assets/` folder rules visuals share with images.
- [slash-menu](slash-menu.md): the `/visual` command and how commands remove their text.
- [ai-assist](ai-assist.md): the settings, setup dialog, and streamed generation the dialog reuses.

### Impact checks

- [extension-shell](extension-shell.md): check when the manifest's sandbox or policy changes.
- [build-pipeline](build-pipeline.md): check when the build plugin's emitted files change.
- [native-helper](native-helper.md): check when asset types or limits change.
- [auto-sync](auto-sync.md): check when visual files are added, since sync commits them with their page.

## Relevant implementation and tests

- `packages/markdown/src/{visual,blocks}.ts`, `packages/markdown/tests/visual.test.ts`
- `helper/src/assets.rs`, with unit tests
- `apps/extension/src/shared/visual.ts`, `apps/extension/src/build/{manifest,plugin}.ts`, `apps/extension/tests/{visual,build}.test.ts`
- `apps/extension/src/app/assetStore.ts`, `apps/extension/src/app/blocks/{VisualBlock,BlockView,PageEditor}.tsx`, `apps/extension/src/app/{VisualDialog,PageView}.tsx`
- `apps/extension/src/shared/{ai,slash}.ts`, `apps/extension/tests/{ai,slash}.test.ts`
- `apps/extension/e2e/visual.spec.ts`
- Flow: [assets/diagrams/visual-block.mmd](../assets/diagrams/visual-block.mmd)

## Acceptance or verification criteria

- [x] A link line to an HTML file in the page's `assets/` folder shows the visual running: its buttons work, it cannot reach the extension's APIs, its parent page, or the network, and the frame takes its content's height.
- [x] **Reload** shows the file's new content after it changes on disk, and clicking the bar edits the link line; the file keeps its bytes and CRLF endings.
- [x] `/visual` opens **Add a visual** with **Generate with AI** chosen and **Set up AI** offered when no key is saved; pasted HTML previews running, and Insert saves `assets/<title>.html` and writes its link line where `/visual` was typed.
- [x] With a saved key, Generate sends the request and shows the provider's refusal as plain text, with Insert disabled; an uploaded `.html` file fills the title, previews, and inserts byte for byte.

## Remaining gaps and unknowns

- A visual's scripts can navigate their own frame to a web address, which would show that site in the frame and could carry the visual's own content in the address; the sandbox has no page data beyond the visual's HTML. Popups and top-level navigation are blocked.
- Visuals cannot load libraries, fonts, or pictures from the web; everything must be inline or a `data:` URL.
- A visual's state resets whenever its frame remounts: after editing its link line, moving blocks above it, or a theme change.
- The watcher ignores `assets` folders, so a visual changed on disk shows the new content only after **Reload** or reopening Quire.
- Visuals are not edited inside Quire; replacing one means adding a new visual. Removing a visual's line leaves its file in `assets/`.
- Search does not look inside visuals, and AI actions on a page see only the link line.
- No wireframe exists yet: `assets/wireframes/style.md`, which wireframes must follow, has not been written.
