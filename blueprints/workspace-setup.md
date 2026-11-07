# Workspace setup

## Outcome or responsibility

A first-time user picks or creates a notes folder and connects it to a Git remote without leaving the app. Covers the helper's folder-choice and Git setup methods, the remembered notes folder, and the app's folder picker and setup checklist.

## Current verified status

**Status:** Planned

Delivered by slice 3. Helper unit tests cover the config file, folder listing and creation, and the full Git sequence against a local bare remote. Extension unit tests cover the state parsers and stage derivation. `e2e/setup.spec.ts` covers the whole flow against a bare remote.

## Architecture dependencies

- [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety): absolute setup paths, the config file location, and the workspace state shape.
- [Git sync](../architecture.md#git-sync): the setup sequence and the readiness rule.
- [Native messaging protocol](../architecture.md#native-messaging-protocol): `NOT_FOUND`, `IO`, and `GIT` errors; long-running methods reply later from a worker thread.
- [Open and connect flow](../architecture.md#open-and-connect-flow): the workspace state is reloaded on every connection.

## Local rules and implications

Helper methods (all after `hello`):

| Method | Params | Result | Errors |
| --- | --- | --- | --- |
| `getWorkspace` | none | workspace state | none |
| `listDirs` | `path?` (absolute; home folder when absent) | `{ path, parent, home, roots, entries: [{ name, path, isRepo }] }` | `BAD_REQUEST` for a relative path, `NOT_FOUND`, `IO` |
| `createDir` | `parent`, `name` | `{ path }` | `BAD_REQUEST` for names with separators, reserved names, or `.`/`..`; `IO` when it exists |
| `setRoot` | `path` | workspace state | `BAD_REQUEST` for a relative path, `NOT_FOUND`, `IO` when the config cannot be written |
| `gitInit` | none | workspace state | `NOT_FOUND` without a root, `GIT` |
| `gitSetIdentity` | `name`, `email` | workspace state | `BAD_REQUEST` for empty, multi-line, option-like, or `@`-less values |
| `gitSetOrigin` | `url` | workspace state | `BAD_REQUEST` for option-like or whitespace-containing URLs |
| `gitPublish` | none | workspace state | `GIT` with Git's own message, for example rejected credentials |

- `gitPublish` runs on a worker thread, so other requests are answered while a push waits on the network. The app allows it 3 minutes.
- Identity is repository-local. A global Git identity satisfies the step without writing anything.
- App stages, from `setupStage` in `src/shared/workspace.ts`: `folder`, `git-missing`, `init`, `identity`, `origin`, `publish`, `ready`. **Change folder** reopens the picker from any stage after the first.
- `WorkspaceStore` (`src/app/workspaceStore.ts`) is created per connection; the `Connected` component is keyed by the connection attempt so a reconnect starts clean.
- Every failed step keeps the user on that step with the helper's message in an alert.

## Related blueprints

### Required

- [native-helper](native-helper.md): the request loop and dispatch this responsibility extends.

### Impact checks

- [extension-shell](extension-shell.md): check when the connected screen or status bar changes.

## Relevant implementation and tests

- `helper/src/config.rs`, `helper/src/dirs.rs`, `helper/src/git.rs`, `helper/src/workspace.rs`, `helper/src/host.rs`: helper side, with unit tests in each file
- `apps/extension/src/shared/workspace.ts`: state types, parsers, and stages
- `apps/extension/src/app/workspaceStore.ts`, `Connected.tsx`, `FolderPicker.tsx`, `GitSetup.tsx`: app side
- `apps/extension/tests/workspace.test.ts`: unit tests
- `apps/extension/e2e/setup.spec.ts`: end-to-end flow against a bare remote

## Acceptance or verification criteria

- [ ] With no remembered folder, the app shows the folder picker at the home folder.
- [ ] A new folder created in the picker can be chosen and is remembered across reloads.
- [ ] Git init, identity, origin, and first push complete from the checklist, and the remote has one commit with `README.md` by the entered author.
- [ ] After setup, the workspace shows the folder name and the status bar shows the branch.
- [ ] Invalid input (a folder name with `/`, an email without `@`) shows the helper's error and the step can be retried.

## Remaining gaps and unknowns

- Remote sign-in that needs an interactive prompt fails with a `GIT` error instead of prompting; the user must set up a credential helper or SSH key first.
- Opening a folder that is a repository with an `origin` but no upstream asks for a first push, which may be rejected when the remote already has history. Pulling an existing remote into an empty folder (clone) is not supported yet.
