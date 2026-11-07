/**
 * Bottom status bar: helper connection, Git branch with its remote tracking
 * branch, and the auto-sync state with a Sync now button.
 */
import { BranchIcon } from "../shared/icons";
import { osLabel } from "../shared/platform";
import type { HelloResult } from "../shared/protocol";
import type { WorkspaceState } from "../shared/workspace";
import type { SyncView } from "./syncStore";

/** Label, dot color, and tooltip for one sync state. */
interface SyncLabel {
  text: string;
  tone: "ok" | "warn" | "error" | "busy";
  title: string;
  canSync: boolean;
}

/** "1 change" or "3 changes", counting local commits not pushed yet. */
function changes(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`;
}

/**
 * Describe the sync state for the status bar.
 */
function syncLabel(sync: SyncView): SyncLabel {
  const result = sync.result;
  if (sync.stopped) {
    return {
      text: "Sync paused",
      tone: "error",
      title: "Your notes and the remote changed in ways Quire can't combine on its own.",
      canSync: true,
    };
  }
  if (sync.phase === "syncing") {
    return { text: "Syncing…", tone: "busy", title: "Syncing with the remote", canSync: false };
  }
  if (sync.error) {
    return { text: "Sync failed", tone: "error", title: sync.error, canSync: true };
  }
  if (result?.state === "offline") {
    const waiting = result.ahead > 0 ? ` · ${changes(result.ahead)} waiting` : "";
    return {
      text: `Offline${waiting}`,
      tone: "warn",
      title: result.message ?? "Quire couldn't reach the remote.",
      canSync: true,
    };
  }
  if (sync.phase === "waiting") {
    return {
      text: "Not synced yet",
      tone: "busy",
      title: "Changes sync a few seconds after you stop typing.",
      canSync: true,
    };
  }
  if (result === null) {
    return { text: "Syncing…", tone: "busy", title: "Syncing with the remote", canSync: false };
  }
  const time = sync.lastSynced === null ? "" : new Date(sync.lastSynced).toLocaleTimeString();
  return { text: "Synced", tone: "ok", title: `Last synced at ${time}`, canSync: true };
}

/**
 * Render the status bar for a connected helper and its notes folder.
 */
export function StatusBar({
  hello,
  workspace,
  sync,
  onSyncNow,
}: {
  hello: HelloResult;
  workspace: WorkspaceState;
  sync: SyncView;
  onSyncNow: () => void;
}) {
  const git = workspace.git;
  const label = syncLabel(sync);
  return (
    <footer className="status-bar" aria-label="Status">
      <span
        className="status-bar__item"
        title={`Quire Helper ${hello.helperVersion} on ${osLabel(hello.os)} (${hello.arch})`}
      >
        <span className="status-dot status-dot--ok" aria-hidden="true" />
        Helper {hello.helperVersion}
      </span>
      {git?.branch && (
        <span
          className="status-bar__item"
          title={git.upstream ? `Tracks ${git.upstream}` : undefined}
          data-testid="status-branch"
        >
          <BranchIcon />
          {git.branch}
        </span>
      )}
      <span className="status-bar__item" role="status" title={label.title} data-testid="sync-status">
        <span className={`status-dot status-dot--${label.tone}`} aria-hidden="true" />
        {label.text}
      </span>
      {label.canSync && (
        <button type="button" className="status-bar__action" onClick={onSyncNow}>
          Sync now
        </button>
      )}
      <span className="status-bar__spacer" />
      <span className="status-bar__item" title={workspace.root ?? undefined}>
        {workspace.root}
      </span>
    </footer>
  );
}
