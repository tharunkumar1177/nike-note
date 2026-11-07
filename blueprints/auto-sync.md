# Auto-sync

## Outcome or responsibility

Once the notes folder is set up, the user never runs Git: edits are committed and pushed a few seconds after typing stops, changes pushed from another computer come in on their own, and when both sides changed the same lines sync pauses with a clear notice instead of losing or mangling anything. Covers the helper's `sync`, the app's sync scheduling, the sync item in the status bar, and the paused-sync notice.

## Current verified status

**Status:** Implemented

Verified in CI (helper sync tests against a local bare remote and a second clone on Windows, macOS, and Linux; app unit tests; end-to-end tests for pushing, pulling, and a paused conflict that resumes) and by hand in Chrome on Windows with the CI build against a local bare remote: the first sync committed and pushed every uncommitted page, an edit was pushed on its own, a change pushed from a second clone appeared without a merge commit, and a conflicting edit paused sync with the file listed, kept the local text, and resumed after a Git merge and Sync now.

## Architecture dependencies

- [Git sync](../architecture.md#git-sync): the sync steps, the result shape, the commit message, and when the app syncs.
- [File write-back and change watching](../architecture.md#file-write-back-and-change-watching): `filesChanged` events start the sync timer, and page writes share a lock with sync.
- [Native messaging protocol](../architecture.md#native-messaging-protocol): long-running methods reply later from a worker thread.

## Local rules and implications

- Helper (`helper/src/sync.rs`): one `sync` call is one full cycle. It returns `synced`, `offline`, or `conflict` as a result, not an error, because all three are normal states the app shows. The fetch and push run without the write lock, so saves are not held up by the network.
- The helper never resolves a conflict itself: it aborts the rebase and leaves the local commit in place. The user combines the changes with Git (for example `git pull --rebase` and fixing the file, or a merge), then selects **Sync now**.
- An unfinished Git operation in the folder (a rebase, merge, cherry-pick, or revert the user started) also pauses sync, with Git's state named in the notice.
- App (`src/app/syncStore.ts`): one sync at a time; a request during a sync runs again 5 seconds after it. A sync that pulled changes reloads the page tree and re-reads open pages, in case the watcher is not running.
- Status bar: **Synced** (tooltip with the time), **Syncing…**, **Not synced yet** (changes waiting for the timer), **Offline · n changes waiting** (Git's message in the tooltip), **Sync failed** (the helper's error in the tooltip), or **Sync paused**. A **Sync now** button sits next to it except while a sync runs.
- The paused notice (`src/app/SyncNotice.tsx`) sits in the sidebar with the files changed on both sides and its own **Sync now** button.
- An open page with unsaved edits whose file changes because of a pull shows the page editor's conflict banner; see [page-editing](page-editing.md).

## Related blueprints

### Required

- [workspace-setup](workspace-setup.md): sync starts only when the branch tracks a remote.
- [page-editing](page-editing.md): saves and the `filesChanged` event.

### Impact checks

- [native-helper](native-helper.md): check when the request loop or worker threads change.
- [extension-shell](extension-shell.md): check when the status bar changes.

## Relevant implementation and tests

- `helper/src/sync.rs`: the sync cycle, with unit tests against a local bare remote and a second clone
- `helper/src/git.rs`: shared Git command helpers
- `helper/src/host.rs`: `sync` dispatch, the write lock, and one-at-a-time syncing
- `apps/extension/src/shared/sync.ts`, `apps/extension/tests/sync.test.ts`
- `apps/extension/src/app/syncStore.ts`, `apps/extension/src/app/StatusBar.tsx`, `apps/extension/src/app/SyncNotice.tsx`, `apps/extension/src/app/Workspace.tsx`
- `apps/extension/e2e/sync.spec.ts`

## Acceptance or verification criteria

- [x] An edit is committed as `Quire: update 1 page` and pushed without any action from the user, and the status bar shows **Synced**.
- [x] A change pushed from another clone appears in the open page after a sync, with no merge commit.
- [x] Local and remote edits to the same line pause sync, list the file, keep the local text on disk and in a local commit, and leave the remote untouched.
- [x] After the user combines the changes with Git, **Sync now** pushes them and sync resumes.
- [x] An unreachable remote keeps commits locally and shows the offline state.

## Remaining gaps and unknowns

- Conflicts are resolved outside Quire. A side-by-side resolver inside the app is not designed yet.
- Remote sign-in that needs an interactive prompt shows as offline; the user must set up a credential helper or SSH key.
- Closing the tab during a sync lets the helper finish it, but if the browser kills the helper first, Git may leave an `index.lock` file that the next sync reports as an error.
