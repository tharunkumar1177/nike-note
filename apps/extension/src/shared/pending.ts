/**
 * Request bookkeeping for the helper connection: allocates ids, matches
 * responses in any order, and fails every waiter when the port closes.
 */
import type { HelperErrorCode, InboundMessage } from "./protocol";

/** An error returned by the helper or raised by the connection. */
export class HelperError extends Error {
  readonly code: HelperErrorCode | string;

  /**
   * Create an error carrying a protocol or connection code.
   */
  constructor(code: HelperErrorCode | string, message: string) {
    super(message);
    this.name = "HelperError";
    this.code = code;
  }
}

interface Waiter {
  resolve: (result: unknown) => void;
  reject: (error: HelperError) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** Tracks in-flight requests by id. */
export class PendingRequests {
  private nextId = 1;
  private readonly waiters = new Map<number, Waiter>();
  private closedWith: HelperError | null = null;

  /** Number of requests still waiting for a reply. */
  get size(): number {
    return this.waiters.size;
  }

  /**
   * Reserve an id and a promise for its reply. A timeout of 0 waits forever.
   */
  create(timeoutMs: number): { id: number; promise: Promise<unknown> } {
    const id = this.nextId;
    this.nextId += 1;
    if (this.closedWith) {
      return { id, promise: Promise.reject(this.closedWith) };
    }
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.waiters.delete(id);
              reject(
                new HelperError(
                  "TIMEOUT",
                  `Quire Helper did not answer within ${Math.round(timeoutMs / 1000)} seconds.`,
                ),
              );
            }, timeoutMs)
          : undefined;
      this.waiters.set(id, { resolve, reject, timer });
    });
    return { id, promise };
  }

  /**
   * Settle the waiter a response or error belongs to. Returns false when the
   * message matches no waiter (late reply after a timeout, or an event).
   */
  settle(message: InboundMessage): boolean {
    if (message.kind === "event" || message.id === null) return false;
    const waiter = this.waiters.get(message.id);
    if (!waiter) return false;
    this.waiters.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.kind === "response") {
      waiter.resolve(message.result);
    } else {
      waiter.reject(new HelperError(message.code, message.message));
    }
    return true;
  }

  /**
   * Reject every waiter and all later requests with the same error.
   */
  close(error: HelperError): void {
    this.closedWith = error;
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters.clear();
  }
}
