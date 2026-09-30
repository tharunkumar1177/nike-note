# Quire

Quire is a block-based workspace for pages, databases, and team collaboration. Users author content as nested blocks, organize work in workspaces, and collaborate in real time.

## Build authority

GitHub Actions is the only build authority for this repository. Install, lint, type-check, test, build, and end-to-end verification all run in CI. Code is considered working only when its CI run is green. Lockfiles are produced by CI, not hand-written.

## Repository layout

This is a pnpm monorepo orchestrated by Turborepo.

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js web application (UI, editor, API) |
| `apps/realtime` | WebSocket collaboration service |
| `apps/worker` | Background job worker |
| `packages/core` | Domain types, schemas, and pure logic |
| `packages/db` | Database schema and data access |
| `packages/editor` | Block editor components |
| `packages/ui` | Design system and shared UI primitives |
| `packages/config` | Shared TypeScript, ESLint, and test configuration |

Root scripts delegate to Turborepo: `lint`, `typecheck`, `test`, `build`, and `e2e`.
