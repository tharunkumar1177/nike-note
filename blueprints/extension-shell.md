# Extension shell

## Outcome or responsibility

The Manifest V3 extension frame: the manifest, the popup's **Open Quire** button, the app page shell (sidebar, main area, status bar), the helper client that owns the native messaging port, and the connection screens shown before the workspace is usable.

## Current verified status

**Status:** Implemented

Delivered by slices 1 and 2. Unit tests cover the manifest, the extension ID, the icons, protocol validation, and request matching. `e2e/shell.spec.ts` covers Open Quire, the handshake, and the install screen against the real helper, which CI now runs on Windows. The `forbidden`, `outdated`, and `stopped` screens are covered only by unit-tested classification, not by e2e.

## Architecture dependencies

- [Extension identity](../architecture.md#extension-identity): the build writes the fixed public `key` into `manifest.json`; `src/shared/identity.ts` exports the ID and host name.
- [Native messaging protocol](../architecture.md#native-messaging-protocol): `src/shared/helperClient.ts` matches responses by `id`, rejects pending requests on disconnect, and validates every inbound message with `src/shared/protocol.ts`.
- [Open and connect flow](../architecture.md#open-and-connect-flow): the popup never connects to the helper; the app page connects once on load.
- [Naming and brand](../architecture.md#naming-and-brand): the manifest name, page titles, and icons say Quire.

## Local rules and implications

- Permissions: `nativeMessaging`, and `storage` for the AI settings (see [ai-assist](ai-assist.md)); no host permissions. Opening or focusing the app tab uses `chrome.runtime.getContexts`, `chrome.tabs.update`, `chrome.windows.update`, and `chrome.tabs.create`, which need no extra permission for the extension's own pages.
- The manifest and the PNG icons are generated at build time by a Vite plugin (`src/build/`), so the version comes from `package.json` and no binary assets are committed.
- Connection states and their screens:

| State | Trigger | Screen |
| --- | --- | --- |
| `connecting` | Port opened, `hello` pending | Spinner and "Connecting to Quire Helper" after a 300 ms delay |
| `missing` | Disconnect message contains "not found" | Install steps for the detected OS, and **Retry** |
| `forbidden` | Disconnect message contains "forbidden" | Reinstall the helper, and **Retry** |
| `outdated` | `PROTOCOL_MISMATCH` | Update the helper, with both protocol numbers, and **Retry** |
| `stopped` | Disconnect after a successful `hello`, or any other failure | "Quire Helper stopped" with the error detail, and **Retry** |
| `unsupported` | `chrome.runtime.connectNative` is unavailable | "Open Quire from the browser toolbar" |
| `connected` | `hello` succeeded | Folder picker, Git setup, or the workspace (see [workspace-setup](workspace-setup.md)); the status bar shows the helper version and branch |

- The app retries automatically when the tab becomes visible again while in `missing`, `forbidden`, `outdated`, or `stopped`.
- Design: system UI font, neutral warm grays, light and dark themes that follow the system unless the user picks one in settings (see [settings](settings.md)), visible focus rings, and reduced motion respected. Tokens live in `src/shared/tokens.css`.

## Related blueprints

### Required

None

### Impact checks

- [native-helper](native-helper.md): check when the client's use of methods, error codes, or the handshake changes.
- [build-pipeline](build-pipeline.md): check when the build output layout or the e2e harness changes.

## Relevant implementation and tests

- `apps/extension/vite.config.ts`, `apps/extension/src/build/`: multi-page build, manifest, and icons
- `apps/extension/src/popup/`: popup
- `apps/extension/src/app/`: app page and connection screens
- `apps/extension/src/shared/`: identity, protocol, helper client, and tokens
- `apps/extension/tests/`: unit tests
- `apps/extension/e2e/`: Playwright tests against the unpacked build and the real helper; `e2e/scope.ts` lists which source files each spec covers (see [build-pipeline](build-pipeline.md))

## Acceptance or verification criteria

- [x] The built `manifest.json` has the fixed key, `nativeMessaging`, the popup, and the icons.
- [x] **Open Quire** opens `app.html`, and pressing it again focuses the same tab instead of opening a second one.
- [x] With the helper registered, the app completes the handshake and moves on to the notes folder screens.
- [x] Without the helper registered, the app shows the install screen.

## Remaining gaps and unknowns

- Not yet published to the Chrome Web Store or Edge Add-ons. A store ID requires adding a second allowed origin.
