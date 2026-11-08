# Settings

## Outcome or responsibility

**Settings** in the sidebar changes how Quire looks, the way Notion's appearance settings do: the theme (System, Light, or Dark), the font of page text (Default, Serif, or Mono), and **Full width**, which lets page text use the whole window. Changes apply as they are chosen and are kept for the browser profile. Settings also leads to the keyboard shortcut reference, which Ctrl+/ (Command+/ on macOS) opens from anywhere in the workspace. Covers the appearance store, the theme tokens, the settings and shortcut dialogs, and the shortcut list.

## Current verified status

**Status:** Implemented

Verified in CI (Vitest for reading and validating settings, the root attributes, key labels on each operating system, the reference key, and the shortcut list; end-to-end tests for every criterion below) and by hand in Chrome on Windows with the CI build: Dark, Serif, and Full width applied at once (background `#191919`, the serif stack on page text, a 1040-pixel text column), were kept across a reload, Ctrl+/ opened the reference with Windows key labels, and choosing System, Default, and Full width off restored a white page with the 708-pixel column. Hand testing found the scrolling shortcut list's focus ring drawn as stray lines outside it; it is now drawn inside the list.

## Architecture dependencies

- [Appearance](../architecture.md#appearance): storage, root attributes, and theme tokens.

## Local rules and implications

- Rule ownership: settings validation and attributes live in `apps/extension/src/shared/appearance.ts`; the shortcut list and key labels live in `apps/extension/src/shared/shortcuts.ts`.
- The app page and the popup create an `AppearanceStore` before rendering, so a saved theme is applied before React draws anything. The app page passes its store to the settings dialog through `AppearanceContext`.
- Theme, font, and width change immediately; there is no Save or Cancel. A save that the browser refuses still changes the open page.
- The page font applies to the title and blocks, including the text being edited. Menus, toolbars, dialogs, the sidebar, and code keep their own fonts. Full width removes the 708-pixel limit on the text column and widens the side padding to 96 pixels on wide windows.
- The shortcut reference lists each shortcut the app handles, grouped as General, Sidebar, Blocks, Tables, Images, Text, and Markdown at the start of a line, with Ctrl, or ⌘, ⇧, and ⌥ on macOS. When a shortcut changes, its entry in `shortcuts.ts` changes with it.
- Ctrl+/ is ignored inside another open dialog and when something else already handled the key; `/` that needs Shift on the keyboard layout still counts.

## Related blueprints

### Required

- [extension-shell](extension-shell.md): the tokens, popup, and app page the settings style.

### Impact checks

- [block-keys](block-keys.md), [inline-formatting](inline-formatting.md), [block-handle](block-handle.md), [page-operations](page-operations.md), [search](search.md), [rich-blocks](rich-blocks.md): check the shortcut list when their keys change.

## Relevant implementation and tests

- `apps/extension/src/shared/{appearance,shortcuts}.ts`, `apps/extension/tests/{appearance,shortcuts}.test.ts`
- `apps/extension/src/shared/tokens.css`, `apps/extension/src/app/app.css`
- `apps/extension/src/app/{SettingsDialog,ShortcutsDialog,Workspace}.tsx`, `apps/extension/src/app/appearanceContext.ts`, `apps/extension/src/{app,popup}/main.tsx`
- `apps/extension/e2e/settings.spec.ts`

## Acceptance or verification criteria

- [x] Choosing Dark, Serif, and Full width changes the page at once, and a reload keeps them.
- [x] A theme chosen in the app page reaches an open popup.
- [x] Choosing System, Default, and Full width off removes every attribute and restores the default column width.
- [x] Ctrl+/ opens the shortcut reference from the page and from an edited line, and Show shortcuts opens it from settings.

## Remaining gaps and unknowns

- Settings are per browser profile and do not travel with the notes folder.
- Width is one setting for every page; Notion's per-page full width and small text are not offered.
- A forced theme can show the system theme for a moment while the app page loads, before its script runs.
