/**
 * Bottom status bar: helper connection, Git branch, and its remote tracking branch.
 */
import { BranchIcon } from "../shared/icons";
import { osLabel } from "../shared/platform";
import type { HelloResult } from "../shared/protocol";
import type { WorkspaceState } from "../shared/workspace";

/**
 * Render the status bar for a connected helper and its notes folder.
 */
export function StatusBar({ hello, workspace }: { hello: HelloResult; workspace: WorkspaceState }) {
  const git = workspace.git;
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
      <span className="status-bar__spacer" />
      <span className="status-bar__item" title={workspace.root ?? undefined}>
        {workspace.root}
      </span>
    </footer>
  );
}
