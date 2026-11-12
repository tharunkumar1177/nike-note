# Build pipeline

## Outcome or responsibility

The repository scaffold and the GitHub Actions workflow that checks, tests, and builds the extension and the native helper, runs end-to-end tests on the unpacked extension with the helper, and publishes the extension zip and per-OS helper binaries as artifacts. It is the only authority for whether code works.

## Current verified status

**Status:** Partial

Delivered by ROADMAP slice 1. Every job in `.github/workflows/ci.yml` passes on branch `slice/01-extension-skeleton`, including the three-OS helper matrix, the install smoke test, and the Playwright e2e job. Both lockfiles are committed from CI artifacts. Branch runs build only the Windows helper and run e2e on Windows, verified on a branch push. Since slice 23 a push runs only the specs its changes can break: verified with a push changing no code (e2e skipped), a push changing only the search dialog (only `search.spec.ts` ran), and a manual run on a work branch (the whole suite ran and passed). A merge to `main` starting no run and the manual `all_os` run are not yet verified.

## Architecture dependencies

- [Naming and brand](../architecture.md#naming-and-brand): artifact names use `quire-extension` and `quire-helper-<os>`.
- [Component model](../architecture.md#component-model): the workspace contains `apps/extension`, `packages/config`, and the Cargo crate in `helper/`, which is outside the pnpm workspace.
- [Dependency direction](../architecture.md#dependency-direction): the `app` and `core` ESLint layers reject imports that break the direction.
- [Toolchain and CI](../architecture.md#toolchain-and-ci): pinned Node and pnpm, Rust stable, the three helper targets, and lockfiles produced by CI.
- [Verification boundaries](../architecture.md#verification-boundaries): the workflow provides every listed level.

## Local rules and implications

- Triggers: a push to any branch except `main`, and a manual run (`workflow_dispatch`). A merge to `main` does not run CI again, since the branch already passed; there is no separate pull request run.
- Jobs: `install` (pnpm, uploads `pnpm-lock.yaml`), then `lint`, `typecheck`, `test` in parallel, then `build` (uploads `quire-extension`). `helper` runs in parallel (fmt, clippy with `-D warnings`, tests, release build, install smoke test, uploads `quire-helper-<os>` and `Cargo.lock` from Windows). `e2e-scope` (Linux, no install) picks the e2e specs. `e2e` needs `build`, `helper`, and `e2e-scope` and runs the picked specs with Playwright on Windows with the Windows helper.
- E2e scope on a push: `apps/extension/e2e/scope.ts` reads the files the branch changed since its merge base with `origin/main`, so every push on a branch reruns the specs for all of the branch's code changes, not only its last commit. A changed spec runs itself. A file listed for a spec in `SPEC_SOURCES` runs that spec; the shared editor and Markdown model run every editor spec. A file in `WHOLE_SUITE` (the e2e harness, the app shell, `src/build/`, the helper's request loop and protocol, package manifests, lockfiles, and toolchain pins) runs the whole suite, and so does any file under `apps/`, `packages/`, or `helper/` the table does not know. Docs, plans, workflows, unit tests, and lint and type configs run nothing, and then `e2e` is skipped.
- A manual run always runs the whole suite. Before a work branch merges, start one on it (`gh workflow run CI --ref <branch>`) and wait for it to pass, since a push run can skip a spec that a change breaks through code the table does not tie to it.
- `e2e` installs Playwright's Chromium without `--with-deps`: on Windows that flag only installs Media Foundation, which took about three minutes, longer than most spec subsets.
- A new spec needs an entry in `SPEC_SOURCES`, and a renamed or deleted source file has to be renamed or removed there; `tests/scope.test.ts` fails until the table lists every spec in `e2e/` and only paths that exist.
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
- `apps/extension/e2e/scope.ts`, `apps/extension/tests/scope.test.ts`: picking specs from a branch's changes

## Acceptance or verification criteria

- [x] A push to a work branch triggers the workflow.
- [ ] A merge to `main` does not trigger the workflow.
- [x] Extension lint, type-check, unit tests, and build pass.
- [x] A branch push builds and tests only the Windows helper (fmt, clippy, tests, release build, smoke test).
- [ ] A manual run with `all_os` passes fmt, clippy, tests, and release builds on Windows, macOS, and Linux and uploads `quire-helper-macos` and `quire-helper-linux`.
- [x] The e2e job on Windows runs Playwright on the unpacked extension with the Windows helper.
- [x] A push runs only the specs `e2e/scope.ts` picks from the branch's changes, and skips e2e when no code changed.
- [x] A manual run runs the whole e2e suite.
- [x] `tests/scope.test.ts` fails when a spec has no entry in the table or the table lists a path that does not exist.
- [x] Artifacts `quire-extension` and `quire-helper-windows` are uploaded on every run.

## Remaining gaps and unknowns

- Actions are pinned by major tag, not commit SHA.
- Helper binaries are unsigned. Windows SmartScreen and macOS Gatekeeper warn on first run.
- There is no release workflow. Artifacts come from CI runs only.
