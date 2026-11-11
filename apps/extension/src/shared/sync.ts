/**
 * Result of the helper's `sync` method and its validator (see
 * blueprints/auto-sync.md).
 */
import { isRecord } from "./protocol";

/** How a sync ended: everything pushed, the remote unreachable, or stopped on a conflict. */
export type SyncState = "synced" | "offline" | "conflict";

/** One finished sync. */
export interface SyncResult {
  state: SyncState;
  /** Local commits the remote does not have yet. */
  ahead: number;
  /** Remote commits not taken in yet. */
  behind: number;
  /** Pages committed by this sync. */
  committed: number;
  /** True when this sync took in remote changes. */
  pulled: boolean;
  /** Files changed on both sides, when the state is a conflict. */
  files: string[];
  /** Git's explanation when the state is offline or Git is busy. */
  message: string | null;
}

const STATES: readonly SyncState[] = ["synced", "offline", "conflict"];

/** True for a whole number that is zero or more. */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Validate the result of `sync`.
 */
export function parseSyncResult(value: unknown): SyncResult {
  if (
    !isRecord(value) ||
    !STATES.includes(value.state as SyncState) ||
    !isCount(value.ahead) ||
    !isCount(value.behind) ||
    !isCount(value.committed) ||
    typeof value.pulled !== "boolean" ||
    !Array.isArray(value.files) ||
    (value.message !== null && typeof value.message !== "string")
  ) {
    throw new TypeError("The helper sent an invalid sync result.");
  }
  return {
    state: value.state as SyncState,
    ahead: value.ahead,
    behind: value.behind,
    committed: value.committed,
    pulled: value.pulled,
    files: value.files.filter((file): file is string => typeof file === "string"),
    message: value.message,
  };
}
