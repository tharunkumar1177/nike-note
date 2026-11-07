/**
 * Workspace shell for a set-up notes folder: sidebar, page area, and status bar.
 */
import { FolderIcon } from "../shared/icons";
import type { HelloResult } from "../shared/protocol";
import type { WorkspaceState } from "../shared/workspace";
import { StatusBar } from "./StatusBar";
import type { WorkspaceStore } from "./workspaceStore";

/**
 * Render the workspace for a notes folder that is ready to sync.
 */
export function Workspace({
  hello,
  workspace,
  store,
}: {
  hello: HelloResult;
  workspace: WorkspaceState;
  store: WorkspaceStore;
}) {
  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Sidebar">
        <div className="sidebar__header">
          <FolderIcon />
          <span className="sidebar__name" title={workspace.root ?? undefined}>
            {workspace.rootName}
          </span>
        </div>
        <div className="sidebar__footer">
          <button
            type="button"
            className="sidebar__action"
            onClick={() => store.setPicking(true)}
          >
            Change folder
          </button>
        </div>
      </aside>
      <main className="page">
        <div className="page__content">
          <h1 className="page__title">{workspace.rootName}</h1>
          <p className="page__lead">
            {`This folder syncs with ${workspace.git?.origin ?? "its remote"} on branch ${workspace.git?.branch ?? "unknown"}.`}
          </p>
        </div>
      </main>
      <StatusBar hello={hello} workspace={workspace} />
    </div>
  );
}
