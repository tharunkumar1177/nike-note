/**
 * The app page's single native messaging connection to Quire Helper.
 */
import { HOST_NAME } from "./identity";
import { HelperError, PendingRequests } from "./pending";
import { classifyDisconnect, parseInbound, type DisconnectKind } from "./protocol";

/** Default time to wait for a reply before failing the request. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * True when native messaging is available, which is only inside the extension.
 */
export function canConnectNative(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime?.connectNative === "function"
  );
}

/** An open connection to the helper. */
export class HelperConnection {
  private readonly port: chrome.runtime.Port;
  private readonly pending = new PendingRequests();
  private readonly eventListeners = new Set<(event: string, data: unknown) => void>();
  private disconnectListener: ((kind: DisconnectKind, detail: string) => void) | null = null;
  private open = true;

  /**
   * Open the port. Chrome starts the helper process immediately.
   */
  constructor() {
    this.port = chrome.runtime.connectNative(HOST_NAME);
    this.port.onMessage.addListener((raw: unknown) => this.receive(raw));
    this.port.onDisconnect.addListener(() => {
      const detail =
        chrome.runtime.lastError?.message ?? "Quire Helper closed the connection.";
      this.shutdown(classifyDisconnect(detail), detail);
    });
  }

  /**
   * Register the single handler called once when the port closes.
   */
  onDisconnect(listener: (kind: DisconnectKind, detail: string) => void): void {
    this.disconnectListener = listener;
  }

  /**
   * Subscribe to helper events. Returns an unsubscribe function.
   */
  onEvent(listener: (event: string, data: unknown) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Send a request and resolve with its validated result.
   */
  async request<T>(
    method: string,
    params: Record<string, unknown>,
    parse: (result: unknown) => T,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    const { id, promise } = this.pending.create(timeoutMs);
    if (this.open) {
      try {
        this.port.postMessage({ id, method, params });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.shutdown("stopped", detail);
      }
    }
    return parse(await promise);
  }

  /**
   * Close the port from the app side, for example before a retry.
   */
  close(): void {
    if (!this.open) return;
    this.disconnectListener = null;
    this.port.disconnect();
    this.shutdown("stopped", "The connection was closed by Quire.");
  }

  /**
   * Validate an inbound message and route it to a waiter or event listeners.
   */
  private receive(raw: unknown): void {
    const message = parseInbound(raw);
    if (!message) {
      console.warn("Quire: ignored a malformed message from the helper", raw);
      return;
    }
    if (message.kind === "event") {
      for (const listener of this.eventListeners) listener(message.event, message.data);
      return;
    }
    if (!this.pending.settle(message) && message.kind === "error") {
      console.warn(`Quire: helper error ${message.code}: ${message.message}`);
    }
  }

  /**
   * Mark the connection closed, fail waiters, and notify the listener once.
   */
  private shutdown(kind: DisconnectKind, detail: string): void {
    if (!this.open) return;
    this.open = false;
    this.pending.close(new HelperError("DISCONNECTED", detail));
    const listener = this.disconnectListener;
    this.disconnectListener = null;
    listener?.(kind, detail);
  }
}
