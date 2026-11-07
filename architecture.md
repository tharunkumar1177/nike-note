# Quire System Architecture

## Purpose and authority

This document owns the shared technical contracts of Quire, a local Markdown workspace delivered as a Chromium extension plus a native helper program. It governs rules that two or more responsibilities must obey. Responsibility-level detail lives in blueprints, routed through [the blueprint manifest](blueprints/README.md). Product scope and non-goals live in [plan.md](plan.md).

Authority order when sources disagree:

1. Green CI on the branch under review (code and tests) is authoritative for current behavior.
2. This document is authoritative for intended shared contracts.
3. Blueprints are authoritative for responsibility-local rules.

Each contract is labeled **Intended** until a slice ships code and tests that enforce it. The owning blueprint then records the evidence.

## System boundaries

Quire runs entirely on the user's computer. There is no Quire server, account, or cloud deploy.

| Actor or service | Role |
| --- | --- |
| Browser user | Single local user of Chrome, Edge, Brave, or Chromium on Windows, macOS, or Linux |
| Notes folder | A user-chosen folder of Markdown pages that is also a Git repository |
| Git remote `origin` | The only network destination of the helper, reached through the user's `git` with their own credentials |
| AI provider (optional) | Called directly from the app page with the user's key, only when the user runs an AI action |
| GitHub Actions | Sole build, test, and verification authority |

Excluded: cloud hosting, accounts, multiple users, real-time co-editing, Firefox, Safari, and mobile.

System overview diagram: [assets/diagrams/system-overview.mmd](assets/diagrams/system-overview.mmd).

## Component model

| Component | Path | Responsibility |
| --- | --- | --- |
| Popup | `apps/extension/src/popup` | One **Open Quire** button that opens or focuses the app page. It never connects to the helper. |
| App page | `apps/extension/src/app` | The full-page UI at `chrome-extension://<id>/app.html`. It owns the single helper connection, the editor, the status bar, and AI calls. |
| Shared extension code | `apps/extension/src/shared` | Protocol types and validators, the helper client, and the design tokens |
| Markdown package | `packages/markdown` (planned, slice 5) | Pure TypeScript parser and serializer. No DOM, Chrome, or I/O APIs. |
| Native helper | `helper/` | Rust binary: native messaging host, self-install, disk access, file watching, search, and Git |
| Shared config | `packages/config` | Shared TypeScript, ESLint, and Vitest configuration |

### Dependency direction

`apps/extension` may depend on `packages/*`. `packages/markdown` depends on no internal package other than `@quire/config` for tooling. No package depends on an app. The helper shares no code with TypeScript; the only contract between them is the [Native messaging protocol](#native-messaging-protocol).

## Shared contracts

### Naming and brand

- The product name is **Quire**. The package scope is `@quire/*`. The helper binary is `quire-helper` (`quire-helper.exe` on Windows). The native messaging host name is `com.quire.helper`.
- All names are set explicitly and are never derived from the workspace folder or repository name.
- The brand word spelled N-I-K-E is forbidden everywhere (see `AGENTS.md`). Agent guardrails enforce it; there is no CI check.

### Extension identity

- The manifest carries a fixed public `key`, so the extension ID is always `hbddhigdogedopjjlihlkpehidopddac` when loaded unpacked.
- The helper's allowed origin is `chrome-extension://hbddhigdogedopjjlihlkpehidopddac/`. The extension ID and the host name are defined once in each language (`apps/extension/src/shared/identity.ts` and `helper/src/identity.rs`), and both must change together.
- A store-published build gets a store-assigned ID; adding it to the allowed origins is a release-time change to both files.

### Native messaging protocol

**Intended.** The app page opens one port with `chrome.runtime.connectNative("com.quire.helper")`. The helper process lives as long as the port and exits when its standard input closes.

Framing: each message is a 32-bit unsigned length in little-endian byte order, followed by that many bytes of UTF-8 JSON. Standard output carries only framed messages; diagnostics go to standard error.

Size limits:

- Helper to extension: at most 1,048,576 bytes per message (a Chrome limit). The helper refuses to send a larger message and returns `TOO_LARGE` instead. Larger payloads (images) use chunked methods added with the slice that needs them.
- Extension to helper: the helper rejects frames larger than 64 MiB and exits, because the stream position is lost.

Envelope:

| Kind | Shape |
| --- | --- |
| Request (extension to helper) | `{ "id": <positive integer>, "method": <string>, "params"?: <object> }` |
| Success response | `{ "id": <same id>, "result": <any JSON> }` |
| Error response | `{ "id": <same id or null>, "error": { "code": <string>, "message": <string> } }` |
| Event (helper to extension) | `{ "event": <string>, "data": <any JSON> }` |

- Every request receives exactly one response. Responses may arrive in any order. The client matches them by `id`.
- `id` is `null` only when the request could not be parsed far enough to read its `id`.
- Error codes: `BAD_REQUEST`, `UNKNOWN_METHOD`, `PROTOCOL_MISMATCH`, `TOO_LARGE`, `OUTSIDE_ROOT`, `NOT_FOUND`, `STALE`, `IO`, `GIT`, `INTERNAL`. New codes are added here first.
- Handshake: the first request is `hello` with `{ "protocol": <integer> }`. The helper answers `{ "helperVersion", "protocol", "os", "arch" }`, or `PROTOCOL_MISMATCH` when the major protocol differs. The current protocol is `1`. Any other method sent before a successful `hello` gets `BAD_REQUEST`.
- Origin check: the helper exits with a non-zero status, without reading any input, unless its first argument is the allowed origin in [Extension identity](#extension-identity).

### Helper registration

**Intended.** `quire-helper install` copies the binary to a per-user location and registers host `com.quire.helper` for Chrome, Edge, Brave, and Chromium. `quire-helper uninstall` reverses it. Neither needs administrator rights.

| OS | Binary location | Registration |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%\Quire\Helper\quire-helper.exe` | Manifest beside the binary. The default value of `HKCU\Software\<browser key>\NativeMessagingHosts\com.quire.helper` holds the manifest path, for `Google\Chrome`, `Microsoft\Edge`, `BraveSoftware\Brave-Browser`, and `Chromium`. |
| macOS | `~/Library/Application Support/Quire/Helper/quire-helper` | `com.quire.helper.json` in `NativeMessagingHosts/` under `~/Library/Application Support/` + `Google/Chrome`, `Microsoft Edge`, `BraveSoftware/Brave-Browser`, `Chromium` |
| Linux | `$XDG_DATA_HOME/quire/helper/quire-helper` (default `~/.local/share`) | `com.quire.helper.json` in `NativeMessagingHosts/` under `$XDG_CONFIG_HOME` (default `~/.config`) + `google-chrome`, `microsoft-edge`, `BraveSoftware/Brave-Browser`, `chromium` |

Run with no arguments, the binary performs `install`, so a double-click works on Windows.

### Notes folder and path safety

**Intended (slice 3).** The helper stores the chosen notes folder path in its own per-user config file, so the browser never prompts for folder access. Every path in a request is relative to that root and uses `/` separators. The helper rejects absolute paths, `..` segments, and any path whose resolved location (after following symbolic links) is outside the root, with `OUTSIDE_ROOT`.

### Page structure

**Intended (slice 4).**

- Every page is a folder. Its body is the folder's `README.md`. Sub-pages are child folders. The notes folder root is the Home page.
- The title is the text of the first `# ` line. Without one, the folder name is the title.
- A sub-page is linked from its parent as a line `[Title](child/README.md)`. Link order sets sidebar order. Child folders with no link follow in case-insensitive alphabetical order.
- `assets/`, `.git/`, and folders whose names start with `.` are never pages.
- A folder without `README.md` is a page with an empty body. Quire creates the file on the first edit.

### Block model and line mapping

**Intended (slice 5).**

- A page body is an ordered list of blocks. Each block owns a contiguous range of source lines and keeps their original text.
- One line is one block, except fenced code blocks, tables, and front matter, which are each one multi-line block.
- Serializing an unedited block emits its original lines unchanged, including line endings. Only edited blocks are re-rendered from their model. The file's dominant line ending (`\n` or `\r\n`) is used for new lines.
- The block-type set and its Markdown syntax are defined in [plan.md](plan.md#block-mapping) and implemented only in `packages/markdown`.

### File write-back and change watching

**Intended (slice 6).** The app writes a whole `README.md` with `writeFile { path, content, baseHash }`. The helper refuses the write with `STALE` when the file's current SHA-256 differs from `baseHash`. Writes go to a temporary file in the same folder, followed by an atomic rename. The helper watches the whole tree and emits `filesChanged` events. It rescans after its own Git operations and when the watcher reports lost events.

### Git sync

**Intended (slice 7).** The helper runs the user's `git` command and never stores credentials. After 5 seconds with no saves, it stages changed files and commits with the message `Quire: update <n> page(s)`. It fetches `origin`, rebases only when the rebase completes without conflict, and pushes. On conflict it aborts the rebase, stops auto-sync, and emits a conflict state. Local work is never discarded.

### AI providers

**Intended (slice 15).** A provider registry maps provider IDs to a label, an API host, and a lazy `load()` import. Each adapter implements `AiProvider` (`listModels`, `stream`). App code never imports a provider SDK directly. Provider hosts are `optional_host_permissions` requested on selection. The key is stored in `chrome.storage.local`. A CI check fails the build if a provider SDK appears in a startup chunk.

## Cross-cutting flows

### Open and connect flow

Popup **Open Quire** focuses an existing app tab (found with `chrome.runtime.getContexts`) or creates one. The app page connects to the helper and sends `hello`. A missing host, a rejected origin, a protocol mismatch, or a disconnect each maps to a distinct app screen.

## Toolchain and CI

- Node.js (pinned in `.nvmrc`), pnpm (pinned with `packageManager`), TypeScript strict mode, Vite.
- Rust stable with `rustfmt` and `clippy`. Helper targets: `x86_64-pc-windows-msvc`, a universal macOS binary (`aarch64-apple-darwin` and `x86_64-apple-darwin`, merged with `lipo`), and `x86_64-unknown-linux-musl`.
- Lockfiles (`pnpm-lock.yaml`, `helper/Cargo.lock`) are produced by CI and committed from CI artifacts, never hand-written.
- GitHub Actions runs extension lint, type-check, unit tests, and build; helper format, lint, tests, and release builds on three operating systems; and Playwright end-to-end tests on the unpacked extension with the Linux helper. Nothing runs locally.

## Verification boundaries

| Level | Establishes |
| --- | --- |
| Unit (Vitest) | Protocol validators, helper client request matching, Markdown parse and serialize (slice 5 on) |
| Unit (`cargo test`) | Framing, envelope handling, origin check, registration paths and manifests, path safety |
| Install smoke (CI, each OS) | `install` writes the manifests or registry keys; `uninstall` removes them |
| End-to-end (Playwright, Linux) | User-visible slice acceptance on the unpacked extension talking to the real helper |

## Blueprints

See [the blueprint manifest](blueprints/README.md).
