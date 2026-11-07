/**
 * External store for the body of the open page. Responses for a page that is
 * no longer open are dropped.
 */
import type { HelperConnection } from "../shared/helperClient";
import { parsePageBody, type PageBody } from "../shared/pageBody";
import { HelperError } from "../shared/pending";

/** Why a page body could not be shown. */
export interface PageBodyError {
  code: string;
  message: string;
}

/** Snapshot read by React. */
export interface PageBodyView {
  path: string | null;
  body: PageBody | null;
  error: PageBodyError | null;
  loading: boolean;
}

/** Loads one page body at a time. */
export class PageBodyStore {
  private view: PageBodyView = { path: null, body: null, error: null, loading: false };
  private readonly listeners = new Set<() => void>();
  private readonly helper: HelperConnection;
  private request = 0;

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
  readonly getSnapshot = (): PageBodyView => this.view;

  /**
   * Show the page at `path`. Loading the same page again keeps its current body
   * on screen until the new one arrives.
   */
  async load(path: string): Promise<void> {
    const request = ++this.request;
    const samePage = this.view.path === path;
    this.update({
      path,
      body: samePage ? this.view.body : null,
      error: samePage ? this.view.error : null,
      loading: true,
    });
    try {
      const body = await this.helper.request("readPage", { path }, parsePageBody);
      if (request === this.request) this.update({ body, error: null, loading: false });
    } catch (error) {
      if (request !== this.request) return;
      this.update({
        body: null,
        error:
          error instanceof HelperError
            ? { code: error.code, message: error.message }
            : { code: "INTERNAL", message: error instanceof Error ? error.message : String(error) },
        loading: false,
      });
    }
  }

  /**
   * Load the open page again, for example after the tab becomes visible.
   */
  async reload(): Promise<void> {
    if (this.view.path !== null) await this.load(this.view.path);
  }

  /**
   * Replace part of the snapshot and notify subscribers.
   */
  private update(patch: Partial<PageBodyView>): void {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
}
