# Build pipeline

## Outcome or responsibility

The repository scaffold and the GitHub Actions workflow that checks, tests, and builds the extension and the native helper, runs end-to-end tests on the unpacked extension with the helper, and publishes the extension zip and per-OS helper binaries as artifacts. It is the only authority for whether code works.

## Current verified status

**Status:** Planned

Owned by ROADMAP slice 1. The cloud-era workflow is replaced.

## Architecture dependencies

- [Naming and brand](../architecture.md#naming-and-brand): artifact names use `quire-extension` and `quire-helper-<os>`.
- [Component model](../architecture.md#component-model): the workspace contains `apps/extension`, `packages/config`, and the Cargo crate in `helper/`, which is outside the pnpm workspace.
- [Dependency direction](../architecture.md#dependency-direction): the `app` and `core` ESLint layers reject imports that break the direction.
- [Toolchain and CI](../architecture.md#toolchain-and-ci): pinned Node and pnpm, Rust stable, the three helper targets, and lockfiles produced by CI.
- [Verification boundaries](../architecture.md#verification-boundaries): the workflow provides every listed level.

## Local rules and implications

- Jobs: `install` (pnpm, uploads `pnpm-lock.yaml`), then `lint`, `typecheck`, `test` in parallel, then `build` (uploads `quire-extension`). `helper` runs as a three-OS matrix in parallel (fmt, clippy with `-D warnings`, tests, release build, install smoke test, uploads `quire-helper-<os>` and `Cargo.lock` from Linux). `e2e` needs `build` and `helper` and runs Playwright on Linux.
- Lockfiles: while a lockfile is missing from the repo, CI resolves it and uploads it as an artifact. The agent commits the artifact contents. After that, installs are frozen (`--frozen-lockfile`, `cargo --locked`).
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

- [ ] A push to a branch triggers the workflow.
- [ ] Extension lint, type-check, unit tests, and build pass.
- [ ] The helper passes fmt, clippy, tests, and release builds on Windows, macOS, and Linux.
- [ ] The e2e job loads the unpacked extension and completes the `hello` handshake with the Linux helper.
- [ ] Artifacts `quire-extension`, `quire-helper-windows`, `quire-helper-macos`, and `quire-helper-linux` are uploaded.

## Remaining gaps and unknowns

- Actions are pinned by major tag, not commit SHA.
- Helper binaries are unsigned. Windows SmartScreen and macOS Gatekeeper warn on first run.
- There is no release workflow. Artifacts come from CI runs only.
