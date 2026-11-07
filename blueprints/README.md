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
| CI, GitHub Actions, workflow, lint, type-check, build, toolchain, lockfile, artifacts, release binaries | Workflow | [build-pipeline](build-pipeline.md) | [Naming and brand](../architecture.md#naming-and-brand), [Component model](../architecture.md#component-model), [Dependency direction](../architecture.md#dependency-direction), [Toolchain and CI](../architecture.md#toolchain-and-ci), [Verification boundaries](../architecture.md#verification-boundaries) | None | [native-helper](native-helper.md) when helper targets or the smoke test change; [extension-shell](extension-shell.md) when the build output or e2e harness changes | `.github/workflows/`, root `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `packages/config`, `helper/Cargo.toml` |
| Native helper, native messaging host, Rust binary, install, uninstall, registry, host manifest, handshake, hello | Component | [native-helper](native-helper.md) | [Extension identity](../architecture.md#extension-identity), [Native messaging protocol](../architecture.md#native-messaging-protocol), [Helper registration](../architecture.md#helper-registration), [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety) | None | [extension-shell](extension-shell.md) when methods, error codes, or the handshake change; [build-pipeline](build-pipeline.md) when targets change | `helper/src/`, CI `helper` job |
| Extension, manifest, popup, Open Quire, app page, connection screen, helper missing, status bar, shell, icons | Component | [extension-shell](extension-shell.md) | [Extension identity](../architecture.md#extension-identity), [Native messaging protocol](../architecture.md#native-messaging-protocol), [Open and connect flow](../architecture.md#open-and-connect-flow), [Naming and brand](../architecture.md#naming-and-brand) | None | [native-helper](native-helper.md) when the client's protocol use changes; [build-pipeline](build-pipeline.md) when build output changes | `apps/extension/src/`, `apps/extension/tests/`, `apps/extension/e2e/` |
| Page tree, sidebar, pages, sub-pages, page order, page title, link line, breadcrumb, routing, URL fragment, tree keyboard | Component | [page-tree](page-tree.md) | [Page structure](../architecture.md#page-structure), [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety), [Native messaging protocol](../architecture.md#native-messaging-protocol) | [workspace-setup](workspace-setup.md) | [native-helper](native-helper.md) when the request loop changes; [extension-shell](extension-shell.md) when the workspace layout changes | `helper/src/pages.rs`, `apps/extension/src/shared/pages.ts`, `apps/extension/src/app/{PageTreeNav,PageView,Workspace}.tsx`, `apps/extension/e2e/pages.spec.ts` |
| Page body, rendering, blocks, Markdown parser, inline formatting, links, readPage, round trip, title block, lists, code block, table | Component | [page-rendering](page-rendering.md) | [Block model and line mapping](../architecture.md#block-model-and-line-mapping), [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety), [Page structure](../architecture.md#page-structure), [Native messaging protocol](../architecture.md#native-messaging-protocol) | [page-tree](page-tree.md) | [native-helper](native-helper.md) when the request loop changes; [build-pipeline](build-pipeline.md) when workspace packages change | `packages/markdown/`, `helper/src/{paths,pages}.rs`, `apps/extension/src/app/{PageView.tsx,pageBodyStore.ts,blocks/}`, `apps/extension/e2e/rendering.spec.ts` |
| Notes folder, choose folder, folder picker, create folder, config file, Git setup, git init, identity, author, origin, remote, first push, publish, onboarding | Workflow | [workspace-setup](workspace-setup.md) | [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety), [Git sync](../architecture.md#git-sync), [Native messaging protocol](../architecture.md#native-messaging-protocol), [Open and connect flow](../architecture.md#open-and-connect-flow) | [native-helper](native-helper.md) | [extension-shell](extension-shell.md) when the connected screen or status bar changes | `helper/src/{config,dirs,git,workspace,host}.rs`, `apps/extension/src/app/`, `apps/extension/src/shared/workspace.ts`, `apps/extension/e2e/setup.spec.ts` |

## Status vocabulary

- `Implemented`: verified in current code and tests.
- `Partial`: some acceptance criteria are verified; gaps are named.
- `Planned`: intended behavior is not yet verified in code.
- `Unknown`: evidence is insufficient; inspect before changing.
- `Deprecated`: retained only for migration or compatibility.
- `Superseded`: replaced by a linked blueprint.
