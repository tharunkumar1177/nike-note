/**
 * External store that decides when to sync the notes folder with its remote
 * and keeps the last result for the status bar (see blueprints/auto-sync.md).
 * The helper does the Git work; this store only schedules it.
 */
import type { HelperConnection } from "../shared/helperClient";
import { parseSyncResult, type SyncResult } from "../shared/sync";

/** Quiet time after the last file change before changes are committed and pushed. */
export const SYNC_DELAY_MS = 5_000;
/** How often an idle, visible app checks the remote for changes. */
export const POLL_MS = 60_000;
/** Waits before retrying after the remote could not be reached, longest last. */
const RETRY_MS: readonly number[] = [30_000, 60_000, 120_000];
/** Wait between retries once the remote has failed many times in a row. */
const MAX_RETRY_MS = 300_000;
/** A sync may wait on the network for a long time. */
const SYNC_TIMEOUT_MS = 180_000;
/** Pause after the tab is hidden, so its last saves reach the disk first. */
const HIDDEN_DELAY_MS = 1_000;

/** What the store is doing now. */
export type SyncPhase = "idle" | "waiting" | "syncing";

/** Snapshot read by React. */
export interface SyncView {
  /** `waiting` means files changed since the last sync started. */
  phase: SyncPhase;
  result: SyncResult | null;
  /** The helper's message when the last sync failed outright. */
  error: string | null;
  /** When the last sync that ended in `synced` finished, in epoch milliseconds. */
  lastSynced: number | null;
  /** True after a conflict: nothing syncs until the user asks. */
  stopped: boolean;
}

/** Schedules syncs for one helper connection, one at a time. */
export class SyncStore {
  private readonly helper: HelperConnection;
  private readonly onPulled: () => void;
  private readonly listeners = new Set<() => void>();
  private view: SyncView = {
    phase: "idle",
    result: null,
    error: null,
    lastSynced: null,
    stopped: false,
  };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private dirty = false;
  private failures = 0;
  private disposed = false;

  /**
   * Bind the store to one helper connection. `onPulled` runs after a sync
   * brought in remote changes.
   */
  constructor(helper: HelperConnection, onPulled: () => void) {
    this.helper = helper;
    this.onPulled = onPulled;
  }

  /** Subscribe for `useSyncExternalStore`. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Current snapshot for `useSyncExternalStore`. */
  readonly getSnapshot = (): SyncView => this.view;

  /**
   * Sync once now, then check the remote every minute while the tab is visible.
   */
  start(): void {
    this.disposed = false;
    this.schedule(0);
    if (this.poll === null) {
      this.poll = setInterval(() => {
        if (document.visibilityState !== "visible" || this.view.stopped) return;
        if (!this.running && this.timer === null) void this.run();
      }, POLL_MS);
    }
  }

  /** Stop all timers; a sync in flight finishes in the helper but is not shown. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    if (this.poll !== null) clearInterval(this.poll);
    this.poll = null;
  }

  /**
   * Note that files in the notes folder changed, and sync once they settle.
   */
  changed(): void {
    this.dirty = true;
    if (!this.view.stopped) this.schedule(SYNC_DELAY_MS);
    this.publish();
  }

  /**
   * The tab was hidden: sync pending changes right after the last saves land.
   */
  hidden(): void {
    if (this.dirty && !this.view.stopped) this.schedule(HIDDEN_DELAY_MS);
  }

  /**
   * Sync now at the user's request, resuming auto-sync after a conflict.
   */
  syncNow(): void {
    this.failures = 0;
    this.update({ stopped: false });
    this.schedule(0);
  }

  /** Run a sync after `delay`, replacing any sync already scheduled. */
  private schedule(delay: number): void {
    if (this.disposed) return;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  /** Cancel the scheduled sync. */
  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Retry later, waiting longer after each failure in a row. */
  private retryLater(): void {
    const delay = RETRY_MS[this.failures] ?? MAX_RETRY_MS;
    this.failures += 1;
    this.schedule(delay);
  }

  /**
   * Ask the helper to sync. A request while one is running waits for it and
   * then runs again.
   */
  private async run(): Promise<void> {
    if (this.running) {
      this.schedule(SYNC_DELAY_MS);
      return;
    }
    this.running = true;
    this.dirty = false;
    this.publish();
    let pulled = false;
    try {
      const result = await this.helper.request("sync", {}, parseSyncResult, SYNC_TIMEOUT_MS);
      if (this.disposed) return;
      pulled = result.pulled;
      if (result.state === "synced") {
        this.failures = 0;
        this.update({ result, error: null, lastSynced: Date.now() });
      } else if (result.state === "conflict") {
        this.clearTimer();
        this.update({ result, error: null, stopped: true });
      } else {
        this.update({ result, error: null });
        this.retryLater();
      }
    } catch (error) {
      if (this.disposed) return;
      this.update({ error: error instanceof Error ? error.message : String(error) });
      this.retryLater();
    } finally {
      this.running = false;
      this.publish();
    }
    if (pulled) this.onPulled();
  }

  /**
   * Replace part of the snapshot and notify subscribers.
   */
  private update(patch: Partial<SyncView>): void {
    this.view = { ...this.view, ...patch };
    this.publish();
  }

  /** Recompute the phase and notify subscribers when the snapshot changed. */
  private publish(): void {
    const phase: SyncPhase = this.running ? "syncing" : this.dirty ? "waiting" : "idle";
    if (phase !== this.view.phase) this.view = { ...this.view, phase };
    for (const listener of this.listeners) listener();
  }
}
