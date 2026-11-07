/**
 * Workspace for a set-up notes folder: page tree sidebar, the open page,
 * auto-sync, and the status bar. One instance per notes folder.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

import { FolderIcon } from "../shared/icons";
import { parseFilesChanged } from "../shared/pageBody";
import { parseCreatedPage, type CreatedPage } from "../shared/pages";
import type { HelloResult } from "../shared/protocol";
import type { WorkspaceState } from "../shared/workspace";
import { AssetContext, AssetStore } from "./assetStore";
import { PageEditorStore } from "./pageEditorStore";
import { createPageOps } from "./pageOps";
import { PageTreeNav } from "./PageTreeNav";
import { PageTreeStore } from "./pageTreeStore";
import { PageView } from "./PageView";
import { currentPage, subscribeRoute } from "./route";
import { StatusBar } from "./StatusBar";
import { SyncNotice } from "./SyncNotice";
import { SyncStore } from "./syncStore";
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
  const [ops] = useState(() => createPageOps(store.helper, pages, editor));
  const [assets] = useState(() => new AssetStore(store.helper));
  const [sync] = useState(
    () =>
      new SyncStore(store.helper, () => {
        void pages.load();
        void editor.refresh(null);
      }),
  );
  const view = useSyncExternalStore(pages.subscribe, pages.getSnapshot);
  const syncView = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const selected = useSyncExternalStore(subscribeRoute, currentPage);

  useEffect(() => {
    void pages.load();
    sync.start();
    const stopEvents = store.helper.onEvent((event, data) => {
      if (event !== "filesChanged") return;
      void pages.load();
      void editor.refresh(parseFilesChanged(data)?.pages ?? null);
      sync.changed();
    });
    store.helper.request("watch", {}, () => undefined).catch((error: unknown) => {
      console.warn("Quire: changes made outside Quire show up when the tab is shown again", error);
    });
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        editor.flushAll();
        sync.hidden();
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
      sync.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [pages, editor, sync, store]);
  useEffect(() => () => assets.dispose(), [assets]);

  /** Create a sub-page and wait until the page tree shows it. */
  const createPage = async (parent: string, title: string): Promise<CreatedPage> => {
    const created = await store.helper.request(
      "createPage",
      { parent, title },
      parseCreatedPage,
    );
    await pages.load();
    return created;
  };

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
          {tree && <PageTreeNav root={tree.root} selected={selected} ops={ops} />}
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
        <SyncNotice sync={syncView} onSyncNow={() => sync.syncNow()} />
        <div className="sidebar__footer">
          <button type="button" className="sidebar__action" onClick={() => store.setPicking(true)}>
            Change folder
          </button>
        </div>
      </aside>
      {tree ? (
        <AssetContext value={assets}>
          <PageView
            root={tree.root}
            path={selected}
            editor={editor}
            treeLoading={view.loading}
            onCreatePage={createPage}
            onRename={(path, title, from) => ops.rename(path, title, from)}
          />
        </AssetContext>
      ) : (
        <main className="page" aria-busy={view.loading} />
      )}
      <StatusBar
        hello={hello}
        workspace={workspace}
        sync={syncView}
        onSyncNow={() => sync.syncNow()}
      />
    </div>
  );
}
