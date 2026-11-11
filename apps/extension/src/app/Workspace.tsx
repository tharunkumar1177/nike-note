/**
 * Workspace for a set-up notes folder: page tree sidebar, the open page,
 * auto-sync, and the status bar. One instance per notes folder.
 */
import { useContext, useEffect, useState, useSyncExternalStore } from "react";

import { FolderIcon, SearchIcon, SettingsIcon } from "../shared/icons";
import { parseFilesChanged } from "../shared/pageBody";
import { parseCreatedPage, type CreatedPage } from "../shared/pages";
import { detectOs } from "../shared/platform";
import type { HelloResult } from "../shared/protocol";
import { isShortcutsKey } from "../shared/shortcuts";
import type { WorkspaceState } from "../shared/workspace";
import { AiSetupDialog } from "./ai/AiSetupDialog";
import { AiSettingsStore } from "./ai/aiStore";
import { AppearanceContext } from "./appearanceContext";
import { AssetContext, AssetStore } from "./assetStore";
import { PageEditorStore } from "./pageEditorStore";
import { createPageOps } from "./pageOps";
import { PageTreeNav } from "./PageTreeNav";
import { PageTreeStore } from "./pageTreeStore";
import { PageView } from "./PageView";
import { currentPage, openPage, subscribeRoute } from "./route";
import { SearchDialog } from "./SearchDialog";
import { SettingsDialog } from "./SettingsDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { StatusBar } from "./StatusBar";
import { SyncNotice } from "./SyncNotice";
import { SyncStore } from "./syncStore";
import type { WorkspaceStore } from "./workspaceStore";

/** The search shortcut's label for this computer. */
const SEARCH_KEYS = detectOs(navigator.userAgent) === "macos" ? "⌘K" : "Ctrl+K";

/**
 * True for Ctrl+K or Ctrl+P (Command on macOS) that nothing else handled
 * and that was not pressed inside an open dialog.
 */
function isSearchShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  if (event.defaultPrevented || event.altKey || event.shiftKey) return false;
  if (!(event.ctrlKey || event.metaKey) || (key !== "k" && key !== "p")) return false;
  return !inDialog(event);
}

/** True when `event` happened inside an open dialog. */
function inDialog(event: KeyboardEvent): boolean {
  return event.target instanceof Element && event.target.closest("dialog") !== null;
}

/** The settings dialog or shortcut reference that is open, if any. */
type SettingsView = "settings" | "shortcuts" | null;

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
  const [ai] = useState(() => new AiSettingsStore());
  const aiView = useSyncExternalStore(ai.subscribe, ai.getSnapshot);
  const [aiSetup, setAiSetup] = useState(false);
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
  const [searching, setSearching] = useState(false);
  const appearance = useContext(AppearanceContext);
  const [settings, setSettings] = useState<SettingsView>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isSearchShortcut(event)) {
        event.preventDefault();
        setSearching(true);
      } else if (isShortcutsKey(event) && !inDialog(event)) {
        event.preventDefault();
        setSettings("shortcuts");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
  useEffect(() => {
    ai.load().catch((error: unknown) => {
      console.warn("Quire: AI settings could not be read", error);
    });
    return () => ai.dispose();
  }, [ai]);

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
        <button
          type="button"
          className="sidebar__search"
          aria-keyshortcuts="Control+K Meta+K"
          onClick={() => setSearching(true)}
        >
          <SearchIcon />
          <span>Search</span>
          <kbd className="sidebar__keys">{SEARCH_KEYS}</kbd>
        </button>
        {appearance && (
          <button type="button" className="sidebar__search" onClick={() => setSettings("settings")}>
            <SettingsIcon />
            <span>Settings</span>
          </button>
        )}
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
          <button
            type="button"
            className="sidebar__action"
            disabled={!aiView.loaded}
            onClick={() => setAiSetup(true)}
          >
            {aiView.settings ? "AI settings" : "Set up AI"}
          </button>
        </div>
      </aside>
      {tree ? (
        <AssetContext value={assets}>
          <PageView
            root={tree.root}
            path={selected}
            editor={editor}
            ai={ai}
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
      {aiSetup && (
        <AiSetupDialog
          store={ai}
          settings={aiView.settings}
          onSaved={() => setAiSetup(false)}
          onClose={() => setAiSetup(false)}
        />
      )}
      {settings === "settings" && appearance && (
        <SettingsDialog
          store={appearance}
          onShowShortcuts={() => setSettings("shortcuts")}
          onClose={() => setSettings(null)}
        />
      )}
      {settings === "shortcuts" && <ShortcutsDialog onClose={() => setSettings(null)} />}
      {searching && tree && (
        <SearchDialog
          helper={store.helper}
          root={tree.root}
          onOpen={(path) => {
            setSearching(false);
            openPage(path);
          }}
          onClose={() => setSearching(false)}
        />
      )}
    </div>
  );
}
