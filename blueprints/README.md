# Blueprint Manifest

## Loading protocol

1. Match the task intent and synonyms against the router below.
2. Load one primary blueprint and only its required architecture anchors.
3. Inspect the listed implementation and tests.
4. Load an impact-check blueprint only if its stated trigger applies.
5. For a shared-contract or ambiguous change, load the complete [architecture](../architecture.md) and every manifest entry that links the affected anchor.
6. Do not load unrelated blueprints.

New blueprints are added here when the slice that owns their responsibility begins (see [ROADMAP](../ROADMAP.md)).

## Router

| Concepts and synonyms | Responsibility type | Primary blueprint | Required architecture contracts | Required blueprints | Impact checks | Principal implementation and tests |
|---|---|---|---|---|---|---|
| CI, GitHub Actions, workflow, scaffold, monorepo, lint, type-check, build, toolchain | Workflow | [build-pipeline](build-pipeline.md) | [Naming and brand](../architecture.md#naming-and-brand), [Component model](../architecture.md#component-model), [Dependency direction](../architecture.md#dependency-direction), [Toolchain and CI](../architecture.md#toolchain-and-ci), [Verification boundaries](../architecture.md#verification-boundaries) | None | [production-readiness](production-readiness.md) when CI jobs, supply-chain controls, or lockfile handling change | `.github/workflows/`, root `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `packages/config` |
| production ready, go-live, launch checklist, hardening, security headers, CSP, rate limiting, observability, logging, error tracking, backups, deploy, rollback, compliance, privacy, accessibility audit | Workflow (release gate) | [production-readiness](production-readiness.md) | [System boundaries](../architecture.md#system-boundaries), [Component model](../architecture.md#component-model), [Authentication and sessions](../architecture.md#authentication-and-sessions), [Error and recovery](../architecture.md#error-and-recovery), [Background jobs](../architecture.md#background-jobs), [Toolchain and CI](../architecture.md#toolchain-and-ci), [Verification boundaries](../architecture.md#verification-boundaries) | [build-pipeline](build-pipeline.md) | None | `.github/workflows/ci.yml`, `apps/web/next.config.ts`, `apps/*/src/index.ts`, `apps/*/src/config.ts`, `packages/db/src/env.ts`, `packages/core/src/errors.ts` |

## Status vocabulary

- `Implemented`: verified in current code and tests.
- `Partial`: some acceptance criteria are verified; gaps are named.
- `Planned`: intended behavior is not yet verified in code.
- `Unknown`: evidence is insufficient; inspect before changing.
- `Deprecated`: retained only for migration or compatibility.
- `Superseded`: replaced by a linked blueprint.
