/**
 * Types and validators for messages exchanged with the helper
 * (see architecture.md, Native messaging protocol).
 */

/** Error codes defined by the protocol contract. */
export const ERROR_CODES = [
  "BAD_REQUEST",
  "UNKNOWN_METHOD",
  "PROTOCOL_MISMATCH",
  "TOO_LARGE",
  "OUTSIDE_ROOT",
  "NOT_FOUND",
  "STALE",
  "IO",
  "GIT",
  "INTERNAL",
] as const;

/** A protocol error code, or `DISCONNECTED` and `TIMEOUT` raised locally by the client. */
export type HelperErrorCode =
  | (typeof ERROR_CODES)[number]
  | "DISCONNECTED"
  | "TIMEOUT";

/** A message received from the helper after validation. */
export type InboundMessage =
  | { kind: "response"; id: number; result: unknown }
  | { kind: "error"; id: number | null; code: string; message: string }
  | { kind: "event"; event: string; data: unknown };

/** The helper's answer to `hello`. */
export interface HelloResult {
  helperVersion: string;
  protocol: number;
  os: string;
  arch: string;
}

/** How a native port closed, derived from Chrome's disconnect message. */
export type DisconnectKind = "missing" | "forbidden" | "stopped";

/**
 * Classify Chrome's `runtime.lastError` message for a closed native port.
 */
export function classifyDisconnect(message: string | undefined): DisconnectKind {
  const text = (message ?? "").toLowerCase();
  if (text.includes("not found")) return "missing";
  if (text.includes("forbidden")) return "forbidden";
  return "stopped";
}

/**
 * Narrow an unknown value to a plain JSON object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True for a positive safe integer, the only valid request id.
 */
function isRequestId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

/**
 * Validate a raw message from the helper. Returns null for anything that does
 * not match the envelope, so malformed input can never resolve a request.
 */
export function parseInbound(value: unknown): InboundMessage | null {
  if (!isRecord(value)) return null;

  if (typeof value.event === "string" && !("id" in value)) {
    return { kind: "event", event: value.event, data: value.data ?? null };
  }

  if ("error" in value) {
    const { error, id } = value;
    if (!isRecord(error)) return null;
    if (typeof error.code !== "string" || typeof error.message !== "string") {
      return null;
    }
    if (id !== null && !isRequestId(id)) return null;
    return { kind: "error", id, code: error.code, message: error.message };
  }

  if ("result" in value && isRequestId(value.id)) {
    return { kind: "response", id: value.id, result: value.result };
  }

  return null;
}

/**
 * Validate the result of `hello`.
 */
export function parseHelloResult(value: unknown): HelloResult {
  if (
    isRecord(value) &&
    typeof value.helperVersion === "string" &&
    Number.isInteger(value.protocol) &&
    typeof value.os === "string" &&
    typeof value.arch === "string"
  ) {
    return {
      helperVersion: value.helperVersion,
      protocol: value.protocol as number,
      os: value.os,
      arch: value.arch,
    };
  }
  throw new TypeError("The helper sent an invalid hello result.");
}
