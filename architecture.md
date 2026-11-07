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
| Markdown package | `packages/markdown` | Pure TypeScript block parser, serializer, inline parser, and link rules. No DOM, Chrome, or I/O APIs. |
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

- Permissions are `nativeMessaging` and `storage` only; there are no host permissions.
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

**Intended.** The helper remembers the chosen notes folder in its own per-user config file, so the browser never prompts for folder access:

| OS | Config file |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Quire\config.json` |
| macOS | `~/Library/Application Support/Quire/config.json` |
| Linux | `$XDG_CONFIG_HOME/quire/config.json` (default `~/.config`) |

The file holds `{ "notesRoot": <absolute path> }` and is replaced atomically. The helper reads it when a connection starts.

Two kinds of path cross the protocol:

- **Setup paths** are absolute and appear only in the folder-choice methods (`listDirs`, `createDir`, `setRoot`). They let the app browse folders before a root exists. `listDirs` returns folder names only, never file names or contents, and hides names that start with `.` or `$` and, on Windows, folders with the hidden or system attribute. `createDir` accepts a single folder name, not a path.
- **Page paths**, used by every later method, are relative to the root and use `/` separators. The helper rejects absolute paths, `.` and `..` segments, backslashes, and any path whose resolved location (after following symbolic links) is outside the root, with `OUTSIDE_ROOT`. Empty segments get `BAD_REQUEST`, and a page folder that does not exist gets `NOT_FOUND`. One function (`helper/src/paths.rs`) performs this check for every page method.

Workspace methods answer with the workspace state `{ root, rootName, rootError, git }`. `rootError` is set when the remembered folder no longer exists. `git` is `null` without a root, otherwise `{ available, version, isRepo, branch, hasCommits, origin, upstream, identity }`. `isRepo` is true only when the root itself is the top level of a repository, so a folder inside another repository is not treated as set up.

### Page structure

- Every page is a folder. Its body is the folder's `README.md`. Sub-pages are child folders. The notes folder root is the root page, shown first in the sidebar. A page's path is its folder path relative to the root with `/` separators; the root page's path is empty.
- The title is the text of the first line that starts with `# `, with any closing `#` sequence removed. Lines in YAML front matter (a leading `---` block) and in fenced code blocks are skipped. Without such a line, the folder name is the title.
- A sub-page is linked from its parent by a whole line `[Title](child/README.md)`. The target may be percent-encoded (`Japan%202027/README.md`), wrapped in angle brackets (`<Japan 2027/README.md>`), or prefixed with `./`. Only direct child folders count. Link order sets sidebar order. Child folders with no link follow in case-insensitive name order.
- `assets/` and folders whose names start with `.` (including `.git/`) are never pages, nor are Windows hidden or system folders. Symbolic links to folders are not followed.
- A folder without `README.md` is a page with an empty body. Quire creates the file on the first edit.
- `createPage { parent, title }` makes a sub-page of page `parent`: a new folder named after the title and a `README.md` whose only line is `# <title>`, and answers `{ path, folder, title }`. Folder names are portable across Windows, macOS, and Linux: characters invalid on any of them and control characters become spaces, runs of spaces collapse, leading dots and trailing dots or spaces are dropped, names are cut to 60 characters, and Windows device names (`CON`, `COM1`, and so on, with or without an extension) and `assets` get ` page` added. An empty result is `Untitled`. A name already used in the parent, compared without case, gets ` 2`, ` 3`, and so on. A link line percent-encodes the folder (parentheses included) and drops `[` and `]` from the title. With `link: true` the helper appends the link line to the parent's body itself; otherwise the app adds it.
- `renamePage { path, title, from? }` writes the new title line and rewrites the parent's link lines. The folder is renamed only while its name follows the old title (the title's folder name, optionally with ` N`) and the new title gives a different name. The optional `from` is the title the user started editing from; since autosave may already have written the new title, the folder also counts as following when it follows `from`. `movePage { path, parent }` moves the folder under another page, removing the old parent's link lines and appending one to the new parent; the root page and moves into the page itself or its sub-pages get `BAD_REQUEST`. `deletePage { path }` removes the folder and everything in it and the parent's link lines; the root page gets `BAD_REQUEST`. Rename and move answer `{ path, folder, title }`, delete answers `{ path }`.
- After a rename or move of a folder, the helper rewrites relative links in every page body (same limits and exclusions as `pageTree`) so they keep pointing at the same files: inline links and reference definitions outside code, keeping `#` and `?` suffixes, the byte order mark, and line endings. External links, fragment-only links, and absolute paths are left alone.
- `pageTree` returns `{ root, truncated }`, where every node is `{ path, name, title, hasReadme, children }`. The helper stops after 5,000 pages or 64 levels and sets `truncated`. `README.md` files larger than 8 MiB contribute no title or links.
- The app keeps the open page in the URL fragment (`app.html#/Trips/Japan%202027`) and reloads the tree whenever the tab becomes visible, until file watching arrives with [File write-back and change watching](#file-write-back-and-change-watching).

### Block model and line mapping

- `readPage { path }` returns `{ path, exists, content }`: the exact text of the page's `README.md`, including any byte order mark and its line endings. A folder without `README.md` gives `exists: false` and empty content. Bodies larger than 512 KiB get `TOO_LARGE`, so the JSON reply stays under the 1 MiB limit; bodies that are not UTF-8 get `IO`.
- A page body is an ordered list of blocks. Each block owns a contiguous range of source lines and keeps their original text (`raw`, with line endings).
- One line is one block, except fenced code blocks, tables, front matter, callouts, and toggles, which are each one multi-line block. An unclosed fence runs to the end of the file. Front matter is recognized only on the first line.
- Rich blocks: a line that is only `![alt](path "title")` is an image block. A callout is a `> [!NOTE]` line (also `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`, any case, alone on the line) and the `>` lines right after it. A toggle runs from a `<details>` or `<details open>` line to its matching `</details>` line, counting nested ones; a `<summary>…</summary>` line as its first non-blank line is its summary, and the rest is its body. An unclosed `<details>` line is text. Table cells are split on unescaped `|`, padded or cut to the header's column count, and aligned by the delimiter row.
- Serializing joins every block's `raw` after the byte order mark, so an unedited document round-trips byte for byte. An edit replaces only the source lines of the blocks it touches, keeping their line ending; new lines use the file's dominant line ending (`\n` or `\r\n`). After every edit the whole text is parsed again, so typing Markdown syntax into a line changes its block type. While a one-line block is edited, its marker (indentation, `#`s, list marker, to-do box, or `>`, always followed by a space) is split off and drawn by the app; the text box holds only the text after it, and the marker is put back unchanged on every edit.
- List nesting is relative: an item indented more than the item above nests one level deeper, up to 8 levels. A line of `---`, `***`, or `___` is always a divider; setext headings are not supported.
- Blocks are moved, duplicated, and deleted as groups: a block plus, for a list item, every deeper list item right after it. Groups move as whole source lines, never above the title or front matter, and a moved last line gets the file's line ending.
- The page's title block is the first `# ` heading (the [Page structure](#page-structure) title rule). The app shows it as the page title and not again in the body.
- The block-type set and its Markdown syntax are defined in [plan.md](plan.md#block-mapping) and implemented only in `packages/markdown`. The helper keeps its own line scanner for titles and link lines; both must accept the same link-line forms.
- Inline styles (bold, italic, strikethrough, code, links) are read by one scanner in `packages/markdown` that also reports each span's source range. Formatting commands add or remove delimiters using those ranges, and the renderer uses the same scan, so what the toolbar reports as styled is what is shown.
- Links: `http:`, `https:`, and `mailto:` links open in a new tab without a referrer. Relative links to a `README.md` inside the notes folder open that page in Quire. Every other link is shown as inert text with its target in a tooltip.

### File write-back and change watching

- `readPage` also returns `hash`, the lowercase hex SHA-256 of the file's bytes (`null` without a `README.md`).
- The app writes a whole `README.md` with `writePage { path, content, baseHash }` and gets `{ path, hash }`. `baseHash` is the hash the app last read or wrote, or `null` to create the file. The helper refuses the write with `STALE` when the file's current hash differs, and with `TOO_LARGE` over 512 KiB.
- Writes go to a dot-named temporary file in the same folder, are flushed to disk, and are renamed over the old file, keeping its permissions. A symbolic link to a file inside the notes folder is written through; one pointing outside is refused with `OUTSIDE_ROOT`.
- `watch` starts a recursive watch of the notes folder for this connection (replacing any earlier one; `setRoot` stops it). The helper then sends `{ "event": "filesChanged", "data": { "pages": [<page path>...], "rescan": <bool> } }` after changes settle (150 ms of quiet, at most 1 s of delay). `pages` lists pages whose `README.md` changed. Changes under dot folders (`.git`), `assets` folders, and dot files are ignored. `rescan` is true when the watcher lost events or more than 500 pages changed, and then `pages` is empty. Any event may also mean the page tree changed.
- The app saves 700 ms after the last edit, and at once when the user switches pages or hides the tab. It never replaces unsaved text with a newer file; that is a conflict, and the user chooses which version to keep. Its own writes come back as events whose hash matches what it wrote, and are ignored.
- If the watch cannot start, the app falls back to reloading when the tab becomes visible.

### Page assets

- A page's images live in its `assets/` folder; image paths in a page resolve relative to the page folder and must stay inside the notes folder. Only PNG, JPEG, GIF, WebP, AVIF, BMP, and SVG files (by extension) are served.
- `readAsset { path, offset }` reads an image by its path in the notes folder (`/`-separated, no segment starting with `.`, checked like a page path) and answers `{ path, size, offset, mime, data }`: up to 512 KiB from `offset`, in base64, so a reply stays under the 1 MiB limit. The app asks again from the next offset until it has `size` bytes, and gives up if the size or type changes meanwhile. Files over 32 MiB get `TOO_LARGE`.
- `writeAsset { page, name, data }` saves base64 `data` (at most 16 MiB decoded, sent in one request under the 64 MiB inbound limit) as a new file in page `page`'s `assets/` folder, creating the folder. The file name is `name` cleaned like a page folder name, with a lowercase extension; a name already used, compared without case, gets ` 2`, ` 3`, and so on before the extension. It is written to a dot-named temporary file and renamed into place, never replacing a file, and answers `{ path, name }`. The app then writes the line `![<name without extension>](assets/<percent-encoded name>)`.

### Search

- `search { query }` runs on a worker thread and answers `{ results, truncated }`, where each result is `{ path, title, snippet }`, best first. A connection has one search at a time: starting one makes any earlier one stop and answer `{ results: [], truncated: false, superseded: true }`.
- The query is split on whitespace into at most 8 words, compared without regard to case. A page matches when every word appears in its title or its body (the `README.md` text except the title line). Pages are walked with the same limits and exclusions as `pageTree`.
- Ranking: a word in the title scores 15 when the title starts with it and 10 otherwise; each word adds its body occurrences, at most 5. Ties go by title, then path. At most 50 results are sent, and `truncated` says more matched.
- The snippet is the first non-blank body line containing a query word (trying the words in order), or the first body line when only the title matched, with leading Markdown markers (`#`s, `>`, list and to-do markers, numbers) removed. Lines longer than 160 characters are cut to 160 starting 60 characters before the match, with `…` where cut.

### Git sync

The helper runs the user's `git` command with terminal prompts and optional locks disabled, and never stores credentials. Remote sign-in relies on the credential helper or SSH agent the user already has.

Setup is a fixed sequence, and the app shows the first incomplete step: Git available, repository initialized (`main` unless the user set `init.defaultBranch`), author identity (written to the repository's local config only when not already set), `origin` remote, and a first push that sets the upstream. The first push commits a `README.md` titled with the folder name when the repository has no commits. A folder is ready when its branch has an upstream.

After setup, sync runs on its own through `sync` (no params), which runs on a worker thread, one at a time per connection, and answers `{ state, ahead, behind, committed, pulled, files, message }`:

1. If Git is in the middle of a rebase, merge, cherry-pick, or revert, nothing is touched and the state is `conflict` with a `message`.
2. Stage everything and commit it as `Quire: update 1 page`, `Quire: update <n> pages` (counting the distinct page folders touched; files under `assets` count for their page), or `Quire: update notes` when only non-page files changed. `committed` is the page count.
3. Fetch the branch's upstream remote. If that fails, the state is `offline` with Git's `message`, and the commits wait for the next sync.
4. When the remote has new commits: fast-forward if there is no local work, otherwise rebase local commits onto the remote. A rebase that stops on a conflict is aborted at once; the state is `conflict` and `files` lists the files changed on both sides. Local work is never discarded and no merge commits are made. `pulled` is true when remote changes came in.
5. Push `HEAD` to the upstream branch. A push refused because the remote moved goes back to step 3, at most 3 times.

`ahead` and `behind` count commits not yet on the remote and not yet taken in. Page writes and the Git steps that change files (commit, fast-forward, rebase) share a lock, so a write never lands in the middle of a rebase. Errors that are not about the remote (no upstream, a failed commit) are `GIT` errors.

The app syncs once when the workspace opens, 5 seconds after file changes settle (every `filesChanged` event, including its own saves), 1 second after the tab is hidden, and every minute while the tab is visible. After `offline` or an error it retries after 30 seconds, then 1, 2, and 5 minutes. After `conflict` it stops until the user selects **Sync now**. The app allows a sync 3 minutes.

### AI providers

- A provider registry (`apps/extension/src/app/ai/providers.ts`) maps each provider ID to a label, the page where keys are created, and a lazy `load()` that dynamically imports its adapter. Each adapter implements `AiProvider`: `listModels(key, signal)` and `stream({ key, model, system, prompt, signal })`, which yields text as it arrives. App code reaches a provider only through the registry and never imports a provider SDK directly. Gemini (`@google/genai`) is the only provider.
- The app page calls the provider's API directly with the user's key. The Gemini API answers cross-origin requests from the extension's origin, so no host permission is requested. The helper is not involved, and nothing else leaves the computer.
- Settings `{ provider, model, key }` are stored under `ai` in `chrome.storage.local` (the `storage` permission), never in the notes folder or the helper's config. Every open Quire tab follows changes.
- The build fails when a provider SDK module is in an entry chunk or in a chunk an entry imports statically (`startupLeaks` in the build plugin), so SDKs load only when an AI action first runs.
- Generated text enters a page only when the user selects Insert, as whole Markdown lines through the page editor's normal edit and save path, so it obeys the same line mapping, hash check, and sync as typing. Prompts carry the page's title and Markdown, never other pages.

## Cross-cutting flows

### Open and connect flow

Popup **Open Quire** focuses an existing app tab (found with `chrome.runtime.getContexts`) or creates one. The app page connects to the helper and sends `hello`. A missing host, a rejected origin, a protocol mismatch, or a disconnect each maps to a distinct app screen. After `hello`, the app sends `getWorkspace` and shows the folder picker, the Git setup step, or the workspace, as described in [Notes folder and path safety](#notes-folder-and-path-safety) and [Git sync](#git-sync). Each new connection reloads the workspace state.

## Toolchain and CI

- Node.js (pinned in `.nvmrc`), pnpm (pinned with `packageManager`), TypeScript strict mode, Vite.
- Rust stable with `rustfmt` and `clippy`. Helper targets: `x86_64-pc-windows-msvc`, a universal macOS binary (`aarch64-apple-darwin` and `x86_64-apple-darwin`, merged with `lipo`), and `x86_64-unknown-linux-musl`.
- Lockfiles (`pnpm-lock.yaml`, `helper/Cargo.lock`) are produced by CI and committed from CI artifacts, never hand-written. When a `package.json` change makes `pnpm-lock.yaml` stale, CI regenerates it for the rest of the run and the `lockfile` job fails until the regenerated file is committed.
- GitHub Actions runs extension lint, type-check, unit tests, and build; helper format, lint, tests, and release builds on three operating systems; and Playwright end-to-end tests on the unpacked extension with the Linux helper. Nothing runs locally.

## Verification boundaries

| Level | Establishes |
| --- | --- |
| Unit (Vitest) | Protocol validators, helper client request matching, Markdown block and inline parsing, byte-exact round trips, source edits, link rules, sync and search results, search highlighting, AI settings, model choice, prompts, and error messages, the startup-chunk check |
| Unit (`cargo test`) | Framing, envelope handling, origin check, registration paths and manifests, page path safety, page reads and guarded writes, change classification and a live watch, sync against a local bare remote and a second clone, search matching, ranking, snippets, and supersession |
| Install smoke (CI, each OS) | `install` writes the manifests or registry keys; `uninstall` removes them |
| End-to-end (Playwright, Linux) | User-visible slice acceptance on the unpacked extension talking to the real helper |

## Blueprints

See [the blueprint manifest](blueprints/README.md).
