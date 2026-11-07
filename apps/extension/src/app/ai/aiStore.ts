/**
 * AI state for the app (see blueprints/ai-assist.md): the saved settings in
 * `chrome.storage.local`, and one streaming generation that can be stopped.
 * Both are external stores for `useSyncExternalStore`.
 */
import { useEffect, useSyncExternalStore } from "react";

import { describeAiError, parseAiSettings, type AiPrompt, type AiSettings } from "../../shared/ai";
import { providerInfo } from "./providers";

/** The `chrome.storage.local` key holding the settings. */
const STORAGE_KEY = "ai";

/** The saved settings once read. */
export interface AiSettingsView {
  loaded: boolean;
  settings: AiSettings | null;
}

/**
 * The AI settings saved in this browser profile.
 */
export class AiSettingsStore {
  private view: AiSettingsView = { loaded: false, settings: null };
  private readonly listeners = new Set<() => void>();
  private readonly onStorage = (changes: Record<string, chrome.storage.StorageChange>): void => {
    const change = changes[STORAGE_KEY];
    if (change) this.set(parseAiSettings(change.newValue));
  };

  /** Subscribe to changes. Returns an unsubscribe function. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The current settings. */
  readonly getSnapshot = (): AiSettingsView => this.view;

  /** Read the saved settings and follow changes made in other tabs. */
  async load(): Promise<void> {
    chrome.storage.local.onChanged.addListener(this.onStorage);
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    this.set(parseAiSettings(stored[STORAGE_KEY]));
  }

  /** Save new settings. */
  async save(settings: AiSettings): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    this.set(settings);
  }

  /** Forget the key and the model. */
  async clear(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEY);
    this.set(null);
  }

  /** Stop following changes. */
  dispose(): void {
    chrome.storage.local.onChanged.removeListener(this.onStorage);
  }

  /** Publish `settings` as loaded. */
  private set(settings: AiSettings | null): void {
    this.view = { loaded: true, settings };
    for (const listener of this.listeners) listener();
  }
}

/** How a generation stands. */
export type AiRunState = "running" | "done" | "stopped" | "failed";

/** The text generated so far and how the generation stands. */
export interface AiRunView {
  text: string;
  state: AiRunState;
  error: string | null;
}

/**
 * One generation with `settings`, streamed into `text`. Starting again
 * discards what came before; stopping keeps the text generated so far.
 */
export class AiRun {
  private view: AiRunView = { text: "", state: "running", error: null };
  private controller: AbortController | null = null;
  private readonly listeners = new Set<() => void>();

  /** Create a generation of `prompt` with `settings`; call `start` to run it. */
  constructor(
    private readonly settings: AiSettings,
    private readonly prompt: AiPrompt,
  ) {}

  /** Subscribe to changes. Returns an unsubscribe function. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The text so far and the state. */
  readonly getSnapshot = (): AiRunView => this.view;

  /** Run the generation from the start, stopping any earlier run. */
  start(): void {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.update({ text: "", state: "running", error: null });
    void this.consume(controller);
  }

  /** Stop a running generation, keeping its text. */
  stop(): void {
    if (this.view.state !== "running") return;
    this.controller?.abort();
    this.controller = null;
    this.update({ ...this.view, state: "stopped" });
  }

  /** Stream the provider's text into the view until done, stopped, or failed. */
  private async consume(controller: AbortController): Promise<void> {
    const signal = controller.signal;
    try {
      const provider = await providerInfo(this.settings.provider).load();
      const request = { ...this.prompt, key: this.settings.key, model: this.settings.model, signal };
      for await (const piece of provider.stream(request)) {
        if (signal.aborted) return;
        this.update({ ...this.view, text: this.view.text + piece });
      }
      if (!signal.aborted) this.update({ ...this.view, state: "done" });
    } catch (error) {
      if (signal.aborted) return;
      this.update({ ...this.view, state: "failed", error: describeAiError(error) });
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  /** Publish a new view. */
  private update(view: AiRunView): void {
    this.view = view;
    for (const listener of this.listeners) listener();
  }
}

/** Subscription used while there is no generation. */
const NO_SUBSCRIPTION = (): (() => void) => () => undefined;
/** Snapshot used while there is no generation. */
const NO_RUN = (): null => null;

/**
 * Follow generation `run`, or nothing while it is null, and stop it when it
 * is replaced or the component unmounts.
 */
export function useAiRun(run: AiRun | null): AiRunView | null {
  useEffect(() => () => run?.stop(), [run]);
  return useSyncExternalStore(run?.subscribe ?? NO_SUBSCRIPTION, run?.getSnapshot ?? NO_RUN);
}
