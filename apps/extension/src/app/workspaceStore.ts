/**
 * External store for the notes folder and Git setup state of one helper connection.
 */
import type { HelperConnection } from "../shared/helperClient";
import { parseWorkspace, type WorkspaceState } from "../shared/workspace";

/** Setup methods that answer with the new workspace state. */
export type WorkspaceMethod =
  | "setRoot"
  | "gitInit"
  | "gitSetIdentity"
  | "gitSetOrigin"
  | "gitPublish";

/** Snapshot read by React. */
export interface WorkspaceView {
  workspace: WorkspaceState | null;
  loadError: string | null;
  busy: WorkspaceMethod | null;
  error: string | null;
  picking: boolean;
}

/** Pushing can wait on the network and on credential prompts. */
const PUBLISH_TIMEOUT_MS = 180_000;

/** Owns the workspace state for the app page. */
export class WorkspaceStore {
  private view: WorkspaceView = {
    workspace: null,
    loadError: null,
    busy: null,
    error: null,
    picking: false,
  };
  private readonly listeners = new Set<() => void>();
  readonly helper: HelperConnection;

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
  readonly getSnapshot = (): WorkspaceView => this.view;

  /**
   * Fetch the workspace state from the helper.
   */
  async load(): Promise<void> {
    try {
      const workspace = await this.helper.request("getWorkspace", {}, parseWorkspace);
      this.update({ workspace, loadError: null });
    } catch (error) {
      this.update({ loadError: describe(error) });
    }
  }

  /**
   * Run one setup method. Returns true on success; failures are kept in `error`.
   */
  async run(method: WorkspaceMethod, params: Record<string, unknown> = {}): Promise<boolean> {
    this.update({ busy: method, error: null });
    try {
      const timeout = method === "gitPublish" ? PUBLISH_TIMEOUT_MS : undefined;
      const workspace = await this.helper.request(method, params, parseWorkspace, timeout);
      this.update({
        workspace,
        busy: null,
        picking: method === "setRoot" ? false : this.view.picking,
      });
      return true;
    } catch (error) {
      this.update({ busy: null, error: describe(error) });
      return false;
    }
  }

  /**
   * Open or close the folder picker while a folder is already set.
   */
  setPicking(picking: boolean): void {
    this.update({ picking, error: null });
  }

  /**
   * Replace part of the snapshot and notify subscribers.
   */
  private update(patch: Partial<WorkspaceView>): void {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
}

/**
 * Turn any thrown value into a readable message.
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
