/**
 * External store for the app page's helper connection state, read by React
 * through `useSyncExternalStore`.
 */
import { canConnectNative, HelperConnection } from "../shared/helperClient";
import { PROTOCOL_VERSION } from "../shared/identity";
import { HelperError } from "../shared/pending";
import { parseHelloResult, type HelloResult } from "../shared/protocol";

/** Connection states, each with its own screen (see blueprints/extension-shell.md). */
export type ConnectionState =
  | { status: "unsupported" }
  | { status: "connecting" }
  | { status: "connected"; hello: HelloResult }
  | {
      status: "missing" | "forbidden" | "outdated" | "stopped";
      detail: string;
    };

/** States from which a retry is meaningful. */
const RETRYABLE = new Set<ConnectionState["status"]>([
  "missing",
  "forbidden",
  "outdated",
  "stopped",
]);

/** Owns the helper connection and publishes its state. */
export class ConnectionStore {
  private state: ConnectionState = { status: "connecting" };
  private readonly listeners = new Set<() => void>();
  private connection: HelperConnection | null = null;
  private attempt = 0;

  /** Subscribe for `useSyncExternalStore`. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Current state for `useSyncExternalStore`. */
  readonly getSnapshot = (): ConnectionState => this.state;

  /** The live connection, available only while connected. */
  get helper(): HelperConnection | null {
    return this.state.status === "connected" ? this.connection : null;
  }

  /**
   * Open a fresh connection and perform the `hello` handshake.
   */
  connect(): void {
    this.connection?.close();
    this.connection = null;
    const attempt = ++this.attempt;

    if (!canConnectNative()) {
      this.set({ status: "unsupported" });
      return;
    }

    this.set({ status: "connecting" });
    let connection: HelperConnection;
    try {
      connection = new HelperConnection();
    } catch (error) {
      this.set({ status: "stopped", detail: describe(error) });
      return;
    }
    this.connection = connection;

    connection.onDisconnect((kind, detail) => {
      if (attempt !== this.attempt) return;
      this.connection = null;
      this.set({ status: kind, detail });
    });

    connection
      .request("hello", { protocol: PROTOCOL_VERSION }, parseHelloResult)
      .then(
        (hello) => {
          if (attempt === this.attempt) this.set({ status: "connected", hello });
        },
        (error: unknown) => {
          if (attempt !== this.attempt) return;
          // A closed port is reported once, by the disconnect handler.
          if (error instanceof HelperError && error.code === "DISCONNECTED") return;
          connection.close();
          this.connection = null;
          const outdated =
            error instanceof HelperError && error.code === "PROTOCOL_MISMATCH";
          this.set({ status: outdated ? "outdated" : "stopped", detail: describe(error) });
        },
      );
  }

  /**
   * Reconnect only when the last attempt failed.
   */
  retryIfFailed(): void {
    if (RETRYABLE.has(this.state.status)) this.connect();
  }

  /**
   * Replace the state and notify subscribers.
   */
  private set(state: ConnectionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

/**
 * Turn any thrown value into a readable message.
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
