/**
 * External store for the open page's text and autosave (see blueprints/page-editing.md).
 * Each page being edited has a session that saves with `writePage` against the
 * hash it last read, so a change made on disk in the meantime is never
 * overwritten silently. Sessions outlive page switches until they are saved.
 */
import type { HelperConnection } from "../shared/helperClient";
import { parsePageBody, parseSavedPage, type PageBody } from "../shared/pageBody";
import { HelperError } from "../shared/pending";

/** Quiet time after the last edit before the page is saved. */
export const SAVE_DELAY_MS = 700;

/** Where a page's latest text stands relative to the file on disk. */
export type SaveState = "saved" | "pending" | "saving" | "failed" | "conflict";

/** Why a page could not be opened. */
export interface PageLoadError {
  code: string;
  message: string;
}

/** Snapshot read by React. */
export interface PageEditorView {
  path: string | null;
  loading: boolean;
  error: PageLoadError | null;
  /** The page text as edited, or null before it has loaded. */
  source: string | null;
  exists: boolean;
  save: SaveState;
  saveError: string | null;
  /** Other pages whose changes are not saved yet. */
  unsavedElsewhere: number;
}

/** One page's text and save progress. */
interface Session {
  path: string;
  source: string;
  savedSource: string;
  baseHash: string | null;
  exists: boolean;
  state: SaveState;
  error: string | null;
  disk: PageBody | null;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  recheck: boolean;
}

/** Describe a failed request for the user. */
function describe(error: unknown): PageLoadError {
  if (error instanceof HelperError) return { code: error.code, message: error.message };
  return { code: "INTERNAL", message: error instanceof Error ? error.message : String(error) };
}

/** Owns page text for one helper connection. */
export class PageEditorStore {
  private readonly helper: HelperConnection;
  private readonly sessions = new Map<string, Session>();
  private readonly listeners = new Set<() => void>();
  private openPath: string | null = null;
  private loadError: PageLoadError | null = null;
  private loading = false;
  private request = 0;
  private view: PageEditorView = {
    path: null,
    loading: false,
    error: null,
    source: null,
    exists: false,
    save: "saved",
    saveError: null,
    unsavedElsewhere: 0,
  };

  /**
   * Bind the store to one helper connection.
   */
  constructor(helper: HelperConnection) {
    this.helper = helper;
  }

  /** Subscribe for `useSyncExternalStore`. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Current snapshot for `useSyncExternalStore`. */
  readonly getSnapshot = (): PageEditorView => this.view;

  /**
   * Show the page at `path`. A page with unsaved changes keeps them; a saved
   * page is read again from disk.
   */
  async open(path: string): Promise<void> {
    if (this.openPath === path && (this.loading || this.sessions.has(path))) return;
    const previous = this.openPath === null ? undefined : this.sessions.get(this.openPath);
    if (previous && previous.state === "pending") this.saveNow(previous);
    this.openPath = path;
    this.loadError = null;
    this.forgetSaved();
    const session = this.sessions.get(path);
    if (session && session.state !== "saved") {
      this.publish();
      return;
    }
    await this.load(path);
  }

  /**
   * Replace the open page's text and save it after a short pause.
   */
  edit(source: string): void {
    const session = this.openSession();
    if (!session || session.source === source) return;
    session.source = source;
    if (session.state === "conflict") {
      this.publish();
      return;
    }
    if (session.state !== "saving") session.state = "pending";
    this.schedule(session, SAVE_DELAY_MS);
    this.publish();
  }

  /**
   * Rewrite page `path`'s latest text with `change`, for edits that finish
   * after a helper request. Returns false, changing nothing, when that page is
   * no longer open.
   */
  transform(path: string, change: (source: string) => string): boolean {
    const session = this.openSession();
    if (!session || session.path !== path) return false;
    this.edit(change(session.source));
    return true;
  }

  /**
   * Save every page with pending changes now, for example when the tab is hidden.
   */
  flushAll(): void {
    for (const session of this.sessions.values()) {
      if (session.state === "pending") this.saveNow(session);
    }
  }

  /** True while any page has changes that are not on disk yet. */
  hasUnsaved(): boolean {
    return [...this.sessions.values()].some((session) => session.state !== "saved");
  }

  /**
   * Try the open page's failed save again.
   */
  retry(): void {
    const session = this.openSession();
    if (session && session.state === "failed") this.saveNow(session);
  }

  /**
   * Settle a conflict: keep the text in Quire (and overwrite the file), or
   * take the version on disk.
   */
  resolveConflict(keep: "mine" | "disk"): void {
    const session = this.openSession();
    const disk = session?.disk;
    if (!session || !disk || session.state !== "conflict") return;
    session.disk = null;
    session.baseHash = disk.hash;
    if (keep === "disk") {
      session.source = disk.content;
      session.savedSource = disk.content;
      session.exists = disk.exists;
      session.state = "saved";
      this.publish();
      return;
    }
    session.savedSource = disk.content;
    session.exists = disk.exists;
    session.state = "pending";
    this.saveNow(session);
  }

  /**
   * React to changes on disk. `pages` lists the changed pages, or is null when
   * anything may have changed. The open page is re-read; unsaved text that
   * differs from the new file becomes a conflict instead of being replaced.
   */
  async refresh(pages: readonly string[] | null): Promise<void> {
    const path = this.openPath;
    if (path === null || (pages !== null && !pages.includes(path))) return;
    const session = this.sessions.get(path);
    if (!session) {
      if (!this.loading) await this.load(path);
      return;
    }
    if (session.inFlight) {
      session.recheck = true;
      return;
    }
    let disk: PageBody;
    try {
      disk = await this.helper.request("readPage", { path }, parsePageBody);
    } catch (error) {
      if (session.state === "saved" && this.openPath === path) {
        this.sessions.delete(path);
        this.loadError = describe(error);
        this.publish();
      }
      return;
    }
    if (disk.hash === session.baseHash || session.inFlight) return;
    if (session.state === "saved") {
      session.source = disk.content;
      session.savedSource = disk.content;
      session.baseHash = disk.hash;
      session.exists = disk.exists;
    } else if (disk.content === session.source) {
      this.clearTimer(session);
      session.savedSource = disk.content;
      session.baseHash = disk.hash;
      session.exists = disk.exists;
      session.state = "saved";
    } else {
      this.clearTimer(session);
      session.disk = disk;
      session.state = "conflict";
    }
    this.publish();
  }

  /**
   * Read a page from disk and make it the open page's session.
   */
  private async load(path: string): Promise<void> {
    const request = ++this.request;
    this.loading = true;
    this.publish();
    try {
      const body = await this.helper.request("readPage", { path }, parsePageBody);
      if (request !== this.request) return;
      const current = this.sessions.get(path);
      if (!current || current.state === "saved") {
        this.sessions.set(path, {
          path,
          source: body.content,
          savedSource: body.content,
          baseHash: body.hash,
          exists: body.exists,
          state: "saved",
          error: null,
          disk: null,
          timer: null,
          inFlight: false,
          recheck: false,
        });
      }
      this.loadError = null;
    } catch (error) {
      if (request !== this.request) return;
      this.loadError = describe(error);
    }
    this.loading = false;
    this.publish();
  }

  /** The session of the open page, if it has loaded. */
  private openSession(): Session | undefined {
    return this.openPath === null ? undefined : this.sessions.get(this.openPath);
  }

  /** Save `session` after `delay` milliseconds, replacing any earlier timer. */
  private schedule(session: Session, delay: number): void {
    this.clearTimer(session);
    session.timer = setTimeout(() => {
      session.timer = null;
      void this.save(session);
    }, delay);
  }

  /** Cancel a pending save timer. */
  private clearTimer(session: Session): void {
    if (session.timer !== null) clearTimeout(session.timer);
    session.timer = null;
  }

  /** Start saving now instead of after the pause. */
  private saveNow(session: Session): void {
    this.clearTimer(session);
    void this.save(session);
  }

  /**
   * Write the session's text over the version it last read. A request already
   * in flight is followed by another once it finishes.
   */
  private async save(session: Session): Promise<void> {
    if (session.inFlight || session.state === "conflict") return;
    if (session.source === session.savedSource && session.exists) {
      session.state = "saved";
      this.publish();
      return;
    }
    const content = session.source;
    session.inFlight = true;
    session.state = "saving";
    this.publish();
    try {
      const saved = await this.helper.request(
        "writePage",
        { path: session.path, content, baseHash: session.baseHash },
        parseSavedPage,
      );
      session.baseHash = saved.hash;
      session.savedSource = content;
      session.exists = true;
      session.error = null;
      session.state = session.source === content ? "saved" : "pending";
    } catch (error) {
      const failure = describe(error);
      if (failure.code === "STALE") {
        session.inFlight = false;
        await this.loadConflict(session);
        return;
      }
      session.state = "failed";
      session.error = failure.message;
    }
    session.inFlight = false;
    if (session.state === "pending") this.schedule(session, SAVE_DELAY_MS);
    if (session.recheck) {
      session.recheck = false;
      void this.refresh([session.path]);
    }
    this.forgetSaved();
    this.publish();
  }

  /**
   * After a refused save, read the file on disk and show the conflict, unless
   * the disk already has exactly the text being saved.
   */
  private async loadConflict(session: Session): Promise<void> {
    session.recheck = false;
    try {
      const disk = await this.helper.request("readPage", { path: session.path }, parsePageBody);
      if (disk.content === session.source) {
        session.savedSource = disk.content;
        session.baseHash = disk.hash;
        session.exists = disk.exists;
        session.state = "saved";
      } else {
        session.disk = disk;
        session.state = "conflict";
      }
    } catch (error) {
      session.state = "failed";
      session.error = describe(error).message;
    }
    this.forgetSaved();
    this.publish();
  }

  /** Drop saved sessions of pages that are not open. */
  private forgetSaved(): void {
    for (const [path, session] of this.sessions) {
      if (path !== this.openPath && session.state === "saved" && !session.inFlight) {
        this.sessions.delete(path);
      }
    }
  }

  /** Rebuild the snapshot and notify subscribers. */
  private publish(): void {
    const session = this.openSession();
    let unsavedElsewhere = 0;
    for (const [path, other] of this.sessions) {
      if (path !== this.openPath && other.state !== "saved") unsavedElsewhere += 1;
    }
    this.view = {
      path: this.openPath,
      loading: this.loading && !session,
      error: session ? null : this.loadError,
      source: session?.source ?? null,
      exists: session?.exists ?? false,
      save: session?.state ?? "saved",
      saveError: session?.error ?? null,
      unsavedElsewhere,
    };
    for (const listener of this.listeners) listener();
  }
}
