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
   */
  async load(): Promise<void> {
    if (this.view.loading) {
      this.queued = true;
      return;
    }
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
    if (this.queued) {
      this.queued = false;
      await this.load();
    }
  }

  /**
   * Replace part of the snapshot and notify subscribers.
   */
  private update(patch: Partial<PageTreeView>): void {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
}
