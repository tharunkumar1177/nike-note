/**
 * Everything shown while the helper is connected: folder choice, Git setup,
 * then the workspace. One instance per helper connection.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

import type { HelperConnection } from "../shared/helperClient";
import type { HelloResult } from "../shared/protocol";
import { setupStage } from "../shared/workspace";
import { FolderPicker } from "./FolderPicker";
import { GitMissing, GitSetup } from "./GitSetup";
import { ScreenCard, Waiting } from "./ScreenCard";
import { Workspace } from "./Workspace";
import { WorkspaceStore } from "./workspaceStore";

/**
 * Load the workspace state and render the screen for the current setup stage.
 */
export function Connected({ hello, helper }: { hello: HelloResult; helper: HelperConnection }) {
  const [store] = useState(() => new WorkspaceStore(helper));
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    void store.load();
  }, [store]);

  const { workspace } = view;
  if (!workspace) {
    if (view.loadError) {
      return (
        <ScreenCard
          title="Quire couldn't read its settings"
          detail={view.loadError}
          onRetry={() => void store.load()}
        >
          <p>The helper is running but didn&apos;t answer. Select Retry to ask again.</p>
        </ScreenCard>
      );
    }
    return <Waiting label="Opening your notes…" />;
  }

  const stage = setupStage(workspace);
  if (stage === "folder" || view.picking) return <FolderPicker store={store} view={view} />;
  if (stage === "git-missing") return <GitMissing workspace={workspace} store={store} />;
  if (stage !== "ready") {
    return <GitSetup stage={stage} workspace={workspace} store={store} view={view} />;
  }
  return (
    <Workspace key={workspace.root} hello={hello} workspace={workspace} store={store} />
  );
}
