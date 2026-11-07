/**
 * Appearance settings shared by the app page and the popup: the color theme,
 * the font of page text, and full-width pages (see blueprints/settings.md).
 * They are kept in the extension origin's `localStorage`, which can be read
 * before the first render, and applied as attributes on the root element
 * that `tokens.css` and `app.css` select on.
 */

/** Color theme: follow the system, or force light or dark. */
export type Theme = "system" | "light" | "dark";

/** Font family of page text. */
export type PageFont = "default" | "serif" | "mono";

/** Every appearance setting. */
export interface Appearance {
  theme: Theme;
  font: PageFont;
  fullWidth: boolean;
}

/** Themes in the order the settings show them. */
export const THEMES: readonly Theme[] = ["system", "light", "dark"];

/** Page fonts in the order the settings show them. */
export const PAGE_FONTS: readonly PageFont[] = ["default", "serif", "mono"];

/** Settings before the user changes anything. */
export const DEFAULT_APPEARANCE: Appearance = { theme: "system", font: "default", fullWidth: false };

/** `localStorage` key of the saved settings. */
export const APPEARANCE_KEY = "quire.appearance";

/**
 * Read settings from an untrusted value. Each field that is missing or not
 * allowed falls back to its default, so one bad field never resets the rest.
 */
export function parseAppearance(value: unknown): Appearance {
  if (typeof value !== "object" || value === null) return DEFAULT_APPEARANCE;
  const record = value as Record<string, unknown>;
  const theme = THEMES.find((item) => item === record.theme) ?? DEFAULT_APPEARANCE.theme;
  const font = PAGE_FONTS.find((item) => item === record.font) ?? DEFAULT_APPEARANCE.font;
  const fullWidth =
    typeof record.fullWidth === "boolean" ? record.fullWidth : DEFAULT_APPEARANCE.fullWidth;
  return { theme, font, fullWidth };
}

/**
 * Read settings saved as JSON text, or the defaults when nothing usable is
 * saved.
 */
export function readAppearance(text: string | null): Appearance {
  if (text === null) return DEFAULT_APPEARANCE;
  try {
    return parseAppearance(JSON.parse(text));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/**
 * The root element attributes for `appearance`: a value to set, or null to
 * remove the attribute. Defaults remove theirs, so the stylesheet's
 * defaults (including following the system theme) apply.
 */
export function appearanceAttributes(appearance: Appearance): Record<string, string | null> {
  return {
    "data-theme": appearance.theme === "system" ? null : appearance.theme,
    "data-font": appearance.font === "default" ? null : appearance.font,
    "data-full-width": appearance.fullWidth ? "" : null,
  };
}

/**
 * Set `appearance`'s attributes on `root`.
 */
export function applyAppearance(root: Element, appearance: Appearance): void {
  for (const [name, value] of Object.entries(appearanceAttributes(appearance))) {
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }
}

/**
 * Appearance settings for one page of the extension: reads and applies them
 * on creation, saves changes, and follows changes made in other tabs.
 */
export class AppearanceStore {
  private readonly storage: Storage;
  private readonly root: Element;
  private appearance: Appearance;
  private readonly listeners = new Set<() => void>();

  /**
   * Read the saved settings from `storage` and apply them to `root`.
   */
  constructor(storage: Storage, root: Element) {
    this.storage = storage;
    this.root = root;
    this.appearance = readAppearance(this.read());
    applyAppearance(root, this.appearance);
  }

  /** Subscribe to changes (for `useSyncExternalStore`). */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The current settings (for `useSyncExternalStore`). */
  getSnapshot = (): Appearance => this.appearance;

  /**
   * Change some settings, apply them at once, and save them. A failed save
   * (storage full or blocked) still applies them to this page.
   */
  update(change: Partial<Appearance>): void {
    const next = parseAppearance({ ...this.appearance, ...change });
    try {
      this.storage.setItem(APPEARANCE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn("Quire: appearance settings could not be saved", error);
    }
    this.show(next);
  }

  /**
   * Follow changes saved by other extension pages through `target`'s
   * `storage` events. Returns a function that stops following.
   */
  follow(target: Window): () => void {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== APPEARANCE_KEY) return;
      this.show(readAppearance(this.read()));
    };
    target.addEventListener("storage", onStorage);
    return () => target.removeEventListener("storage", onStorage);
  }

  /** The saved JSON text, or null when there is none or storage is blocked. */
  private read(): string | null {
    try {
      return this.storage.getItem(APPEARANCE_KEY);
    } catch {
      return null;
    }
  }

  /** Apply `next` and notify subscribers when it differs. */
  private show(next: Appearance): void {
    const current = this.appearance;
    if (
      next.theme === current.theme &&
      next.font === current.font &&
      next.fullWidth === current.fullWidth
    ) {
      return;
    }
    this.appearance = next;
    applyAppearance(this.root, next);
    for (const listener of this.listeners) listener();
  }
}
