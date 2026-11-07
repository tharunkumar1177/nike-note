/**
 * External store for the page tree of the notes folder.
 */
import type { HelperConnection } from "../shared/helperClient";
import { parsePageTree, type PageTree } from "../shared/pages";

/** Snapshot read by React. */
export interface PageTreeView {
  tree: PageTree | null;
  error: string | null;
  loading: boolean;
}

/** Loads the page tree and reloads it on request, one request at a time. */
export class PageTreeStore {
  private view: PageTreeView = { tree: null, error: null, loading: false };
  private readonly listeners = new Set<() => void>();
  private readonly helper: HelperConnection;
  private queued = false;
  private running: Promise<void> | null = null;

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
  readonly getSnapshot = (): PageTreeView => this.view;

  /**
   * Fetch the tree. A call during a fetch schedules one more fetch after it.
   * The promise settles once the tree reflects the folder as it was when
   * `load` was called.
   */
  load(): Promise<void> {
    if (this.running) {
      this.queued = true;
      return this.running;
    }
    this.running = this.fetchUntilCurrent();
    return this.running;
  }

  /**
   * Fetch the tree, then again for as long as more loads were asked for
   * meanwhile.
   */
  private async fetchUntilCurrent(): Promise<void> {
    do {
      this.queued = false;
      this.update({ loading: true });
      try {
        const tree = await this.helper.request("pageTree", {}, parsePageTree);
        this.update({ tree, error: null, loading: false });
      } catch (error) {
        this.update({
          error: error instanceof Error ? error.message : String(error),
          loading: false,
        });
      }
    } while (this.queued);
    this.running = null;
  }

  /**
   * Replace part of the snapshot and notify subscribers.
   */
  private update(patch: Partial<PageTreeView>): void {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
}
