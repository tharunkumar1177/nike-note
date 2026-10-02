# Production readiness

## Outcome or responsibility

The go-live gate: the conditions Quire must meet before it serves real users in production, and the register of gaps between those conditions and the current code. This blueprint owns the gap register and the gate criteria. It does not own how each gap is fixed; that belongs to the blueprint or slice named as owner in each row.

## Current verified status

**Status:** Planned

Audited 2026-10-02 against branch `slice/01-walking-skeleton` (commit `1856683`). Only ROADMAP slice 1 has code, and its GitHub Actions run `36916470966` is red (guard job failure; all later jobs skipped). Quire is not production ready. Already in place: the forbidden-word guard (`packages/config/guard/forbidden-word.js`), liveness `/health` routes in all three apps, SIGTERM handling in `apps/realtime/src/index.ts` and `apps/worker/src/index.ts`, `DATABASE_URL` validation in `packages/db/src/env.ts`, and `poweredByHeader: false` in `apps/web/next.config.ts`.

## Architecture dependencies

- [System boundaries](../architecture.md#system-boundaries): the gate covers every in-scope component and external service listed there (Vercel, Fly.io, Resend, object store, Google OAuth); a gap in any of them blocks go-live.
- [Component model](../architecture.md#component-model): each of `apps/web`, `apps/realtime`, and `apps/worker` must pass the gate independently, because they deploy to different hosts.
- [Authentication and sessions](../architecture.md#authentication-and-sessions): CSRF and cookie hardening gaps are judged against this contract and close with the auth slice.
- [Error and recovery](../architecture.md#error-and-recovery): the `RATE_LIMITED` code exists in `packages/core/src/errors.ts`, but nothing emits it; rate limiting must use that code once built.
- [Background jobs](../architecture.md#background-jobs): job timeout, retry, and idempotency gaps are judged against this contract.
- [Toolchain and CI](../architecture.md#toolchain-and-ci): every gate criterion is verified only by a green CI run; no criterion is satisfied by documentation alone.
- [Verification boundaries](../architecture.md#verification-boundaries): accessibility and performance checks, once added, run as part of the end-to-end level.

## Local rules and implications

- Go-live requires zero open `blocker` rows and zero open `high` rows in the register below.
- A row closes only when its owner blueprint cites the code and tests that close it and CI on `main` is green. Then delete the row here.
- Rows with slice `none` have no scheduled owner. Scheduling them changes the slice plan in `ROADMAP.md`, which needs user approval under `AGENTS.md`.
- Proposed new shared contracts (listed under gaps) change `architecture.md` and need user approval before they are written.

### Gap register

Severity: `blocker` stops any deploy; `high` stops go-live; `medium` should close before general availability.

| Area | Gap | Evidence | Severity | Owner | Slice |
|---|---|---|---|---|---|
| Delivery | CI is not green on the skeleton | Run 36916470966: guard fails on a tracked agent prompt file | blocker | [build-pipeline](build-pipeline.md) | 1 |
| Delivery | Lockfile is never committed; every run resolves dependencies fresh, so builds are not reproducible | `.github/workflows/ci.yml` uploads `pnpm-lock.yaml` as an artifact only; no lockfile in the repo | blocker | [build-pipeline](build-pipeline.md) | 1 |
| Delivery | No deploy workflows for Vercel or Fly.io; no environments, previews, rollback, or release versioning | `.github/workflows/` holds `ci.yml` only; all packages at version `0.0.0` | blocker | proposed `deployment` | none |
| Data | No migrations directory and no migration step in deploy | `packages/db/drizzle.config.ts` exists; no `packages/db/migrations/` | blocker | block store slice | 3 |
| Security | No security headers or Content-Security-Policy | `apps/web/next.config.ts` sets only `poweredByHeader` | high | proposed `security-hardening` | none |
| Security | No CSRF protection or session cookie hardening | absent; no auth code yet | high | auth slice | 2 |
| Security | No rate limiting at the API or WebSocket edge | `packages/core/src/errors.ts` defines `RATE_LIMITED` only | high | proposed `security-hardening` | none |
| Security | No dependency audit, CodeQL, or Dependabot | `.github/workflows/ci.yml`; no `.github/dependabot.yml` | high | [build-pipeline](build-pipeline.md) | none |
| Security | Workflow declares no `permissions:`, so the token gets repository defaults; actions are pinned by tag, not commit SHA | `.github/workflows/ci.yml` | high | [build-pipeline](build-pipeline.md) | none |
| Config | No validated environment schema per app; only `DATABASE_URL` and `PORT` are validated | `packages/db/src/env.ts`, `apps/realtime/src/config.ts`, `apps/worker/src/config.ts`; `apps/web` reads no env | high | proposed `Configuration` contract | none |
| Observability | No structured logging or error tracking | `console.*` in `apps/realtime/src/index.ts`, `apps/worker/src/index.ts` | high | proposed `observability` | none |
| Observability | No metrics or tracing | absent | high | proposed `observability` | none |
| Data | No backups, restore drill, point-in-time recovery, or retention policy | absent | high | proposed `data-operations` | none |
| Reliability | No WebSocket, Redis fan-out, reconnect, or multi-instance realtime | `apps/realtime/src/server.ts` serves HTTP health only | high | real-time sync slice | 7 |
| Compliance | No account deletion or personal data export | absent | high | proposed `compliance-privacy` | none |
| Legal | No LICENSE, terms of service, or privacy policy | absent in repo root and `apps/web/app` | high | proposed `compliance-privacy` | none |
| Observability | Liveness only; no readiness probe that checks Postgres and Redis | `/health` routes in all three apps | medium | proposed `observability` | none |
| Config | `apps/web` cannot fail fast on missing env because it reads none yet | `apps/web/app/api/health/route.ts` | medium | proposed `Configuration` contract | none |
| Reliability | Graceful shutdown has no forced-exit timeout, so a hung close never exits | `apps/realtime/src/index.ts`, `apps/worker/src/index.ts` | medium | proposed `observability` | none |
| Reliability | No request or job timeouts and retries | absent; worker has no queue yet | medium | proposed `worker-jobs` | none |
| Delivery | Branch protection and required checks on `main` are unverified | GitHub settings, not in repo | medium | proposed `deployment` | none |
| Delivery | `minimumReleaseAge` is enforced only as the pnpm default, not declared | `pnpm-workspace.yaml`; earlier CI runs rejected too-new versions | medium | [build-pipeline](build-pipeline.md) | none |
| Performance | No performance budgets, cache headers, or CDN policy | absent | medium | proposed `performance-delivery` | none |
| Compliance | No audit log of workspace actions | only audit fields on the block record in `architecture.md` | medium | proposed `compliance-privacy` | 24 (partial) |
| Accessibility | No automated accessibility checks or WCAG target | `apps/web/e2e/landing.spec.ts` checks title and heading only | medium | proposed `ui-design-system` | none |

## Related blueprints

### Required

- [build-pipeline](build-pipeline.md) — owns the CI rows of the register and is the only way any row can be verified closed.

### Impact checks

None

## Relevant implementation and tests

- `.github/workflows/ci.yml` — CI jobs; source of delivery and supply-chain rows
- `apps/web/next.config.ts` — HTTP response configuration
- `apps/realtime/src/index.ts`, `apps/worker/src/index.ts` — process lifecycle and logging
- `apps/realtime/src/config.ts`, `apps/worker/src/config.ts`, `packages/db/src/env.ts` — environment validation
- `packages/core/src/errors.ts` — shared error codes
- `apps/web/e2e/landing.spec.ts` — current end-to-end coverage

No test verifies any gate criterion yet.

## Acceptance or verification criteria

- [ ] CI on `main` is green with a committed lockfile.
- [ ] No `blocker` or `high` rows remain in the gap register.
- [ ] Each app deploys from a GitHub Actions workflow, runs migrations before serving, and can roll back to the previous release.
- [ ] A restore from backup into a fresh database has been performed and recorded.
- [ ] Production errors from all three apps reach an error tracker with release and environment tags.
- [ ] Security headers and CSP are asserted by an end-to-end test.

## Remaining gaps and unknowns

- Proposed `architecture.md` contracts, pending user approval: **Security controls** (headers, CSP, CSRF, rate limits, secrets), **Configuration** (per-app validated env, fail-fast startup), **Observability** (log format, error tracking, metrics, tracing, liveness vs readiness), **Data durability** (migrations at deploy, backups, recovery objectives, retention), **Deployment and release** (environments, previews, rollback, versioning), **Privacy and compliance** (export, deletion, audit log, legal pages).
- Proposed blueprints, created only when a slice takes them on: `security-hardening`, `observability`, `data-operations`, `deployment`, `compliance-privacy`, `performance-delivery`, `worker-jobs`, `ui-design-system`.
- Vendors for error tracking, metrics, and managed Postgres and Redis are undecided.
- Recovery point and recovery time objectives are undecided.
- Whether GitHub branch protection is enabled on `main` was not inspected.
