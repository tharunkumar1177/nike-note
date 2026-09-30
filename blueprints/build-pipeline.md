# Build pipeline

## Outcome or responsibility

The monorepo scaffold and the GitHub Actions workflow that installs, checks, tests, and builds every Quire app and package. It is the only authority for whether code works.

## Current verified status

**Status:** Planned

No workflow or scaffold exists yet. Owned by ROADMAP slice 1.

## Architecture dependencies

- [Naming and brand](../architecture.md#naming-and-brand): every package `name` is `@quire/<name>`, set explicitly; the workflow's first check step fails the run when the forbidden word appears in tracked files, using a case-insensitive character-class pattern.
- [Component model](../architecture.md#component-model): the scaffold creates the listed `apps/*` and `packages/*` workspaces so later slices only add code.
- [Dependency direction](../architecture.md#dependency-direction): lint configuration rejects imports that violate the direction rules.
- [Toolchain and CI](../architecture.md#toolchain-and-ci): pinned Node and pnpm; lockfile generated in CI and committed through a follow-up commit or artifact, never hand-written.
- [Verification boundaries](../architecture.md#verification-boundaries): the workflow provides Postgres and Redis service containers (object storage is added with the files slice) and a Playwright job, even when early suites are small.

## Local rules and implications

- Jobs: `guard` (forbidden word) → `install` → `lint`, `typecheck`, `test` (parallel) → `build` → `e2e`.
- pnpm enforces a one-day `minimumReleaseAge`. Pin only versions published at least 24 hours before the CI run; the policy stays on.
- Dependencies with install scripts must be listed under `allowBuilds` in `pnpm-workspace.yaml`.
- TypeScript is pinned to the newest release that satisfies the `typescript-eslint` peer range (6.0.x as of 2026-09-30; the native 7.x compiler is outside that range). Check the peer range before bumping.
- Workspace convention: every `packages/*` library (except `packages/config`, which ships plain JS and JSON) builds with `tsc` to `dist/` and exposes `exports` with `types` and `default` pointing into `dist/`. Node apps build with `tsc` to `dist/` and run `node dist/index.js`. Turborepo `build`, `typecheck`, and `test` depend on upstream `^build`.
- Every workspace has an `eslint.config.js` calling `createQuireEslintConfig({ layer })` from `@quire/config/eslint` with its layer: `core` for `packages/core`; `domain` for `packages/db`, `packages/editor`, `packages/ui`; `tooling` for `packages/config`; `app` for `apps/*`. Scripts: `lint` = `eslint .`, `typecheck` = `tsc --noEmit`, `test` = `vitest run`.
- Turborepo caches task outputs; CI uses `turbo run <task>` so only affected workspaces rebuild.
- Every app must build with no environment secrets other than those provided to CI; missing required env fails fast at startup, not at build.
- The skeleton ships a real, minimal Quire landing route in `apps/web` and health endpoints in `apps/realtime` and `apps/worker`, each covered by a test.

## Related blueprints

### Required

None

### Impact checks

None

## Relevant implementation and tests

Planned paths (not yet present):

- `.github/workflows/ci.yml`
- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`
- `packages/config`

## Acceptance or verification criteria

- [ ] A push to a branch triggers the CI workflow.
- [ ] The guard step fails when a tracked file contains the forbidden word (verified by a test fixture run against the pattern, not by committing the word).
- [ ] Lint, type-check, unit tests, build, and e2e all run and pass on the skeleton.
- [ ] `apps/web` renders a Quire page verified by a Playwright test.
- [ ] `apps/realtime` and `apps/worker` health endpoints are covered by tests.

## Remaining gaps and unknowns

- How the CI-generated lockfile gets committed (bot commit vs. manual follow-up) is decided in the slice 1 plan.
- The S3-compatible CI container is not yet provisioned: the `minio/minio` Docker Hub image is no longer pullable. The files and media slice picks the emulator image and adds it to the test job.
- Deploy workflows (Vercel, Fly.io) are out of scope until a deploy slice is scheduled.
