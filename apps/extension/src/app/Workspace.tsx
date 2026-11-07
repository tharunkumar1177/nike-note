/**
 * Workspace for a set-up notes folder: page tree sidebar, the open page, and
 * the status bar. One instance per notes folder.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

import { FolderIcon } from "../shared/icons";
import { parseFilesChanged } from "../shared/pageBody";
import type { HelloResult } from "../shared/protocol";
import type { WorkspaceState } from "../shared/workspace";
import { PageEditorStore } from "./pageEditorStore";
import { PageTreeNav } from "./PageTreeNav";
import { PageTreeStore } from "./pageTreeStore";
import { PageView } from "./PageView";
import { currentPage, subscribeRoute } from "./route";
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
  const [pages] = useState(() => new PageTreeStore(store.helper));
  const [editor] = useState(() => new PageEditorStore(store.helper));
  const view = useSyncExternalStore(pages.subscribe, pages.getSnapshot);
  const selected = useSyncExternalStore(subscribeRoute, currentPage);

  useEffect(() => {
    void pages.load();
    const stopEvents = store.helper.onEvent((event, data) => {
      if (event !== "filesChanged") return;
      void pages.load();
      void editor.refresh(parseFilesChanged(data)?.pages ?? null);
    });
    store.helper.request("watch", {}, () => undefined).catch((error: unknown) => {
      console.warn("Quire: changes made outside Quire show up when the tab is shown again", error);
    });
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        editor.flushAll();
        return;
      }
      void pages.load();
      void editor.refresh(null);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!editor.hasUnsaved()) return;
      editor.flushAll();
      event.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      stopEvents();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [pages, editor, store]);

  const tree = view.tree;
  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Sidebar">
        <div className="sidebar__header">
          <FolderIcon />
          <span className="sidebar__name" title={workspace.root ?? undefined}>
            {workspace.rootName}
          </span>
        </div>
        <div className="sidebar__pages">
          {tree && <PageTreeNav root={tree.root} selected={selected} />}
          {tree?.truncated && (
            <p className="sidebar__note">
              This folder has too many pages to show them all. Some pages are missing here.
            </p>
          )}
          {view.error && (
            <div className="sidebar__note" role="alert">
              <p>Quire couldn&apos;t read the pages: {view.error}</p>
              <button type="button" className="sidebar__action" onClick={() => void pages.load()}>
                Try again
              </button>
            </div>
          )}
        </div>
        <div className="sidebar__footer">
          <button type="button" className="sidebar__action" onClick={() => store.setPicking(true)}>
            Change folder
          </button>
        </div>
      </aside>
      {tree ? (
        <PageView root={tree.root} path={selected} editor={editor} />
      ) : (
        <main className="page" aria-busy={view.loading} />
      )}
      <StatusBar hello={hello} workspace={workspace} />
    </div>
  );
}
