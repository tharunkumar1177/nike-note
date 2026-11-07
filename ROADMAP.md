# Quire Roadmap

Quire is a local Markdown workspace that runs as a Chromium extension (Chrome, Edge, Brave) with a small native helper program. The notes live in a folder on the user's computer. Every page is a folder with a `README.md`. The helper keeps the folder committed and pushed to a Git remote. There is no Quire server, no account, and no cloud deploy.

## Approved decisions

- **Product shape:** Manifest V3 extension. The popup has one button, **Open Quire**, which opens or focuses the full-page app (`app.html`). The app talks to the native helper through Chrome native messaging.
- **Extension stack:** TypeScript, React, Vite multi-page build, pnpm workspaces with Turborepo.
- **Stable extension ID:** `hbddhigdogedopjjlihlkpehidopddac`, fixed by the public `key` in the manifest. The helper accepts only this ID.
- **Markdown:** a TypeScript parser and serializer written in-house, with no DOM or Chrome APIs. Each line is one block. Multi-line constructs (fenced code, tables, front matter) are single blocks. Unchanged lines are written back byte-for-byte. The project does not use remark or markdown-it.
- **Native helper:** Rust, a single binary. It owns all disk access, file watching (`notify`), search (`ignore`, `grep-searcher`), and Git (the user's `git` command). It never parses Markdown. It installs and registers itself with `quire-helper install`.
- **Page structure:** every page is a folder with a `README.md`. Sub-pages are child folders, and link lines in the parent set their order. `assets/`, `.git/`, and folders whose names start with a dot are never pages.
- **Git:** mandatory. The notes folder must be a repository with an `origin` remote. Auto-commit and push run after an idle period. Rebase happens only when it is conflict-free; otherwise auto-sync stops and shows a conflict state. Local work is never discarded.
- **AI:** optional, bring-your-own key, Gemini first. Each provider SDK is bundled as a lazy-loaded chunk and loaded only after the user selects that provider. The key stays in `chrome.storage.local`.
- **Targets:** Windows x64, macOS universal (arm64 and x64), Linux x64 (musl). Binaries are unsigned for now.
- **Build authority:** GitHub Actions only. CI produces the lockfiles (`pnpm-lock.yaml`, `Cargo.lock`), and they are committed from the CI artifacts.
- **Non-goals:** cloud hosting, accounts, multiple users, real-time co-editing, Firefox, and Safari.

Shared contracts are in [architecture.md](architecture.md). Responsibility detail is routed through [the blueprint manifest](blueprints/README.md).

## How to resume

Pick the first unchecked slice. Route it through [the blueprint manifest](blueprints/README.md) and follow the build loop in `.cursor/orchestrator.md`. Slice branches are named `slice/<number>-<short-name>`. A slice is done only when its CI run is green and its blueprint records the evidence.

## Slices

### Foundation

- [x] 1. Walking skeleton: remove the cloud code; MV3 extension with the popup and an app page; a Rust helper that answers a `hello` handshake over native messaging; CI for both (extension lint, type-check, unit tests, build; helper fmt, clippy, tests, and release builds on Windows, macOS, and Linux; Playwright e2e on the unpacked extension with the helper)
- [x] 2. Helper install and connection: `quire-helper install` and `uninstall` for Chrome, Edge, Brave, and Chromium on each OS; app screens for a missing, rejected, outdated, or stopped helper
- [x] 3. Folder and Git setup: pick the folder through the helper; require a repo with `origin`; guided init and first push; status bar with the branch

### Reading and editing

- [x] 4. Page tree: build the sidebar from the folder structure and link order
- [x] 5. Read rendering: one block per line for the initial block set
- [ ] 6. Edit and save: autosave through the helper, unchanged lines kept identical, outside edits picked up through the file watcher
- [ ] 7. Auto-sync: auto-commit, fetch, push, the full status bar, and the conflict state

### Notion-style editing

- [ ] 8. Block keyboard behavior and Markdown shortcuts while typing
- [ ] 9. Slash menu: `/h1` to `/h6`, `/quote`, `/bullet`, `/numbered`, `/todo`, `/code`, `/divider`, `/text`, `/page`
- [ ] 10. Inline formatting with a selection toolbar
- [ ] 11. Block handle: drag, turn into, duplicate, delete, indent and outdent
- [ ] 12. Page operations: create a sub-page (folder, README, and link line), rename, move, delete
- [ ] 13. Rich blocks: tables, images from `assets/`, callouts, toggles
- [ ] 14. Search: Ctrl+K, run by the helper

### AI and polish

- [ ] 15. AI setup: provider and model choice, key entry, lazy SDK load, summarize page
- [ ] 16. AI writing: generate blocks (for example, a vacation plan) and ask about a page
- [ ] 17. Settings: theme, font, full width, shortcut reference

## Checkpoint log

- 2026-09-30: Phase 0 complete for the earlier cloud, multi-user plan.
- 2026-11-07: Pivot approved. The cloud plan (Next.js, realtime service, worker, Postgres, hosting) is replaced by the local extension and native helper described above. The previous slice list and the production-readiness audit are retired. Next: slice 1 on branch `slice/01-extension-skeleton`.
- 2026-11-07: Slices 1 and 2 done and green in CI on Windows, macOS, and Linux. The downloaded CI build was verified by hand in Chrome 156 on Windows: install, Open Quire, and the handshake. Next: slice 3 (folder and Git setup).
- 2026-11-07: Slice 3 done and green in CI. The e2e test runs the whole setup against a bare remote. The downloaded CI build was verified by hand in Chrome on Windows: browse from the home folder, create a folder, turn on Git, connect a local bare remote, push, and reopen the picker with Change folder. Hand testing found hidden Windows folders such as `AppData` listed in the picker; they are now filtered by attribute. Next: slice 4 (page tree).
- 2026-11-07: Slice 4 done and green in CI, including five end-to-end tests of the tree. The CI build was checked by hand in Chrome on Windows: link order, title fallback, nested navigation, breadcrumb, and a folder without README.md. Next: slice 5 (read rendering).
- 2026-11-07: Slice 5 done and green in CI. `@quire/markdown` parses every page into blocks and round-trips files byte for byte; the helper's `readPage` checks every page path against the notes folder. CI now regenerates a stale `pnpm-lock.yaml` and fails the `lockfile` job until it is committed. The CI build was checked by hand in Chrome on Windows with a CRLF file that starts with a byte order mark: every block type, safe external links, and a relative link to a sibling page. Next: slice 6 (edit and save).
