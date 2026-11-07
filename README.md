# Quire

Quire is a local Markdown workspace that runs as a Chromium extension (Chrome, Edge, Brave). Your notes are a folder on your computer: every page is a folder with a `README.md`, shown as Notion-style blocks. A small native helper program reads and writes the folder and keeps it committed and pushed to your Git remote. There is no Quire server and no account.

- Product plan: [plan.md](plan.md)
- Shared technical contracts: [architecture.md](architecture.md)
- Slices and progress: [ROADMAP.md](ROADMAP.md)
- Responsibility blueprints: [blueprints/README.md](blueprints/README.md)

## Build authority

GitHub Actions is the only build authority for this repository. Lint, type-check, tests, builds, and end-to-end verification all run in CI. Code counts as working only when its CI run is green. Lockfiles are produced by CI and committed from its artifacts, never hand-written.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/extension` | Manifest V3 extension: popup, app page, helper client (TypeScript, React, Vite) |
| `helper` | `quire-helper`, the native messaging host (Rust) |
| `packages/config` | Shared TypeScript, ESLint, and Vitest configuration |
| `assets/diagrams`, `assets/wireframes` | Architecture diagrams and UI wireframes |

## Trying a CI build

1. Download the `quire-extension` artifact and your OS's `quire-helper-<os>` artifact from a green CI run.
2. Install the helper: on Windows, double-click `quire-helper.exe`. On macOS or Linux, run `chmod +x quire-helper && ./quire-helper install` (on macOS, first run `xattr -d com.apple.quarantine quire-helper`).
3. Open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, select **Load unpacked**, and choose the unzipped `quire-extension` folder.
4. Select the Quire toolbar icon, then **Open Quire**.

`quire-helper uninstall` removes the helper registrations.
