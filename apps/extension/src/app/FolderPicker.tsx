/**
 * In-app folder browser for choosing or creating the notes folder. The helper
 * lists folders; the browser never sees file contents here.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ArrowUpIcon, FolderIcon, HomeIcon, PlusIcon } from "../shared/icons";
import { parseCreatedDir, parseDirListing, type DirListing } from "../shared/workspace";
import { openPage } from "./route";
import { ScreenCard } from "./ScreenCard";
import type { WorkspaceStore, WorkspaceView } from "./workspaceStore";

/**
 * Turn any thrown value into a readable message.
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Render the folder picker, starting at the current notes folder or the home folder.
 */
export function FolderPicker({
  store,
  view,
}: {
  store: WorkspaceStore;
  view: WorkspaceView;
}) {
  const current = view.workspace?.root ?? null;
  const [listing, setListing] = useState<DirListing | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    store.helper
      .request("listDirs", current ? { path: current } : {}, parseDirListing)
      .then(
        (result) => {
          if (!cancelled) setListing(result);
        },
        (error: unknown) => {
          if (cancelled) return;
          store.helper.request("listDirs", {}, parseDirListing).then(
            (home) => {
              if (!cancelled) setListing(home);
            },
            () => {
              if (!cancelled) setListError(describe(error));
            },
          );
        },
      );
    return () => {
      cancelled = true;
    };
  }, [store, current]);

  /**
   * Show another folder; results from older navigations are ignored.
   */
  function open(path: string): void {
    const request = ++latest.current;
    setListError(null);
    setNewName(null);
    store.helper.request("listDirs", { path }, parseDirListing).then(
      (result) => {
        if (request === latest.current) setListing(result);
      },
      (error: unknown) => {
        if (request === latest.current) setListError(describe(error));
      },
    );
  }

  /**
   * Create a subfolder of the shown folder and open it.
   */
  async function create(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!listing || newName === null) return;
    setCreating(true);
    setListError(null);
    try {
      const path = await store.helper.request(
        "createDir",
        { parent: listing.path, name: newName.trim() },
        parseCreatedDir,
      );
      setNewName(null);
      open(path);
    } catch (error) {
      setListError(describe(error));
    } finally {
      setCreating(false);
    }
  }

  /**
   * Make the shown folder the notes folder; a different folder opens at its root page.
   */
  async function choose(path: string): Promise<void> {
    const chosen = await store.run("setRoot", { path });
    if (chosen && path !== current) openPage("");
  }

  const choosing = view.busy === "setRoot";
  const error = listError ?? view.error ?? view.workspace?.rootError ?? null;

  return (
    <ScreenCard title={current ? "Change notes folder" : "Choose a notes folder"} wide>
      <p>
        Quire keeps every page as a folder with a <code>README.md</code> inside this folder.
        Choose an empty folder, or one that already holds Quire pages.
      </p>

      <div className="picker" aria-busy={!listing}>
        <div className="picker__bar">
          <button
            type="button"
            className="q-button q-button--icon"
            title="Parent folder"
            aria-label="Parent folder"
            disabled={!listing?.parent}
            onClick={() => listing?.parent && open(listing.parent)}
          >
            <ArrowUpIcon />
          </button>
          <button
            type="button"
            className="q-button q-button--icon"
            title="Home folder"
            aria-label="Home folder"
            disabled={!listing?.home}
            onClick={() => listing?.home && open(listing.home)}
          >
            <HomeIcon />
          </button>
          {listing && listing.roots.length > 1 && (
            <select
              className="picker__roots"
              aria-label="Drive"
              value={listing.roots.find((root) => listing.path.startsWith(root)) ?? ""}
              onChange={(event) => open(event.target.value)}
            >
              {listing.roots.map((root) => (
                <option key={root} value={root}>
                  {root}
                </option>
              ))}
            </select>
          )}
          <span className="picker__path" title={listing?.path}>
            {listing?.path ?? "Loading…"}
          </span>
        </div>

        <ul className="picker__list" aria-label="Folders">
          {listing?.entries.map((entry) => (
            <li key={entry.path}>
              <button type="button" className="picker__entry" onClick={() => open(entry.path)}>
                <FolderIcon />
                <span className="picker__name">{entry.name}</span>
                {entry.isRepo && <span className="picker__badge">Git</span>}
              </button>
            </li>
          ))}
          {listing && listing.entries.length === 0 && (
            <li className="picker__empty">No folders here</li>
          )}
        </ul>

        {newName !== null ? (
          <form className="picker__new" onSubmit={(event) => void create(event)}>
            <input
              className="q-input"
              aria-label="New folder name"
              placeholder="Folder name"
              value={newName}
              autoFocus
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setNewName(null)}
            />
            <button
              type="submit"
              className="q-button"
              disabled={creating || newName.trim() === ""}
            >
              Create
            </button>
            <button type="button" className="q-button" onClick={() => setNewName(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="q-button picker__add"
            disabled={!listing}
            onClick={() => setNewName("")}
          >
            <PlusIcon />
            New folder
          </button>
        )}
      </div>

      {error && (
        <p className="screen__error" role="alert">
          {error}
        </p>
      )}

      <div className="screen__actions">
        <button
          type="button"
          className="q-button q-button--primary"
          disabled={!listing || choosing}
          onClick={() => listing && void choose(listing.path)}
        >
          {choosing ? "Opening…" : "Use this folder"}
        </button>
        {current && !view.workspace?.rootError && (
          <button type="button" className="q-button" onClick={() => store.setPicking(false)}>
            Cancel
          </button>
        )}
      </div>
    </ScreenCard>
  );
}
