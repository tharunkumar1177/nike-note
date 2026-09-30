/** Shared error codes for tRPC, WebSocket, and domain failures. */
export const QUIRE_ERROR_CODES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  VALIDATION: "VALIDATION",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
} as const;

export type QuireErrorCode =
  (typeof QUIRE_ERROR_CODES)[keyof typeof QUIRE_ERROR_CODES];

/** Domain error carrying a stable machine-readable code and human message. */
export class QuireError extends Error {
  readonly code: QuireErrorCode;

  constructor(code: QuireErrorCode, message: string) {
    super(message);
    this.name = "QuireError";
    this.code = code;
  }
}

/** Returns true when value is a {@link QuireError} instance. */
export function isQuireError(value: unknown): value is QuireError {
  return value instanceof QuireError;
}
