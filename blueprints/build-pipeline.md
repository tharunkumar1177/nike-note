# Build pipeline

## Outcome or responsibility

The repository scaffold and the GitHub Actions workflow that checks, tests, and builds the extension and the native helper, runs end-to-end tests on the unpacked extension with the helper, and publishes the extension zip and per-OS helper binaries as artifacts. It is the only authority for whether code works.

## Current verified status

**Status:** Partial

Delivered by ROADMAP slice 1. Every job in `.github/workflows/ci.yml` passes on branch `slice/01-extension-skeleton`, including the three-OS helper matrix, the install smoke test, and the Playwright e2e job. Both lockfiles are committed from CI artifacts. The Windows-only branch runs, the manual `all_os` run, and e2e on Windows are not yet verified in CI.

## Architecture dependencies

- [Naming and brand](../architecture.md#naming-and-brand): artifact names use `quire-extension` and `quire-helper-<os>`.
- [Component model](../architecture.md#component-model): the workspace contains `apps/extension`, `packages/config`, and the Cargo crate in `helper/`, which is outside the pnpm workspace.
- [Dependency direction](../architecture.md#dependency-direction): the `app` and `core` ESLint layers reject imports that break the direction.
- [Toolchain and CI](../architecture.md#toolchain-and-ci): pinned Node and pnpm, Rust stable, the three helper targets, and lockfiles produced by CI.
- [Verification boundaries](../architecture.md#verification-boundaries): the workflow provides every listed level.

## Local rules and implications

- Triggers: a push to any branch except `main`, and a manual run (`workflow_dispatch`). A merge to `main` does not run CI again, since the branch already passed; there is no separate pull request run.
- Jobs: `install` (pnpm, uploads `pnpm-lock.yaml`), then `lint`, `typecheck`, `test` in parallel, then `build` (uploads `quire-extension`). `helper` runs in parallel (fmt, clippy with `-D warnings`, tests, release build, install smoke test, uploads `quire-helper-<os>` and `Cargo.lock` from Windows). `e2e` needs `build` and `helper` and runs Playwright on Windows with the Windows helper.
- Helper operating systems: only Windows on branch pushes. A manual run with `all_os` checked (`gh workflow run CI --ref main -f all_os=true`) adds macOS and Linux, for releases. macOS runners cost ten times and Windows runners twice as many minutes as Linux.
- The e2e harness registers the helper per test: a manifest in the profile's `NativeMessagingHosts` folder on Linux and macOS, plus `HKCU` registry keys for Chromium, Chrome, and Chrome for Testing on Windows, removed after each test. The sandbox is passed as `HOME` and `XDG_CONFIG_HOME`, or `USERPROFILE` and `LOCALAPPDATA` on Windows.
- Lockfiles: while a lockfile is missing from the repo, CI resolves it and uploads it as an artifact. The agent commits the artifact contents. After that, installs are frozen (`--frozen-lockfile`, `cargo --locked`). When a `package.json` change makes `pnpm-lock.yaml` stale, the `install` job regenerates it and every later job uses the regenerated artifact, so the run still tests the change; the `lockfile` job fails until the agent commits the artifact.
- pnpm enforces a one-day `minimumReleaseAge`. Pin only versions published at least 24 hours before the CI run.
- TypeScript stays on 6.0.x until `typescript-eslint` supports 7.x.
- Every pnpm workspace has an `eslint.config.js` that calls `createQuireEslintConfig({ layer })`. Scripts: `lint` = `eslint .`, `typecheck` = `tsc --noEmit`, `test` = `vitest run`.
- The macOS helper is one universal binary made with `lipo` from the arm64 and x64 builds. The Linux helper is statically linked with musl.

## Related blueprints

### Required

None

### Impact checks

- [native-helper](native-helper.md): check when helper targets, the install smoke test, or the helper artifact layout change.
- [extension-shell](extension-shell.md): check when the extension build output or the e2e harness changes.

## Relevant implementation and tests

- `.github/workflows/ci.yml`: job graph
- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`: toolchain pins and task graph
- `helper/Cargo.toml`, `helper/rust-toolchain.toml`: Rust pins
- `packages/config/tests/dependency-direction.test.ts`: import direction rules
- `apps/extension/playwright.config.ts`, `apps/extension/e2e/`: end-to-end harness

## Acceptance or verification criteria

- [ ] A push to a work branch triggers the workflow, and a merge to `main` does not.
- [x] Extension lint, type-check, unit tests, and build pass.
- [ ] A branch push builds only the Windows helper; a manual run with `all_os` passes fmt, clippy, tests, and release builds on Windows, macOS, and Linux.
- [ ] The e2e job on Windows loads the unpacked extension and completes the `hello` handshake with the Windows helper.
- [ ] Artifacts `quire-extension` and `quire-helper-windows` are uploaded on every run, and `quire-helper-macos` and `quire-helper-linux` on an `all_os` run.

## Remaining gaps and unknowns

- Actions are pinned by major tag, not commit SHA.
- Helper binaries are unsigned. Windows SmartScreen and macOS Gatekeeper warn on first run.
- There is no release workflow. Artifacts come from CI runs only.
