/**
 * The keyboard shortcut reference shown in settings (see
 * blueprints/settings.md). Each entry mirrors a key the app handles; the
 * blueprint of the owning feature defines its behavior.
 */
import type { DesktopOs } from "./platform";

/**
 * One key combination, for example `["Mod", "Shift", "X"]`. `Mod` is Ctrl,
 * or Command on macOS.
 */
export type KeyCombo = readonly string[];

/** An action and the combinations that run it. */
export interface Shortcut {
  action: string;
  keys: readonly KeyCombo[];
}

/** A titled group of shortcuts. */
export interface ShortcutGroup {
  title: string;
  shortcuts: readonly Shortcut[];
}

/** Every shortcut, grouped as the reference shows them. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { action: "Search pages", keys: [["Mod", "K"], ["Mod", "P"]] },
      { action: "Show keyboard shortcuts", keys: [["Mod", "/"]] },
      { action: "Close a dialog or menu, or stop editing", keys: [["Esc"]] },
    ],
  },
  {
    title: "Sidebar",
    shortcuts: [
      { action: "Open the page", keys: [["Enter"]] },
      { action: "Rename the page", keys: [["F2"]] },
      { action: "Delete the page", keys: [["Del"]] },
    ],
  },
  {
    title: "Blocks",
    shortcuts: [
      { action: "Open the block menu", keys: [["/"]] },
      { action: "New block, or continue a list", keys: [["Enter"]] },
      { action: "Remove the block type, or join with the block above", keys: [["Backspace"]] },
      { action: "Nest or un-nest a list item", keys: [["Tab"], ["Shift", "Tab"]] },
      { action: "Check or uncheck a to-do", keys: [["Mod", "Enter"]] },
      { action: "Move between blocks", keys: [["↑"], ["↓"]] },
      { action: "Move the block up or down", keys: [["Mod", "Shift", "↑"], ["Mod", "Shift", "↓"]] },
      { action: "Duplicate the block", keys: [["Mod", "D"]] },
    ],
  },
  {
    title: "Tables",
    shortcuts: [
      { action: "Next or previous cell, adding a row after the last", keys: [["Tab"], ["Shift", "Tab"]] },
      { action: "Cell below, adding a row at the bottom", keys: [["Enter"]] },
      { action: "Move between cells", keys: [["↑"], ["↓"], ["←"], ["→"]] },
    ],
  },
  {
    title: "Text",
    shortcuts: [
      { action: "Bold", keys: [["Mod", "B"]] },
      { action: "Italic", keys: [["Mod", "I"]] },
      { action: "Strikethrough", keys: [["Mod", "Shift", "X"]] },
      { action: "Inline code", keys: [["Mod", "E"]] },
      { action: "Add or edit a link", keys: [["Mod", "K"]] },
    ],
  },
  {
    title: "Markdown at the start of a line",
    shortcuts: [
      { action: "Heading 1, 2, or 3", keys: [["#", "Space"], ["##", "Space"], ["###", "Space"]] },
      { action: "Bulleted list", keys: [["-", "Space"]] },
      { action: "Numbered list", keys: [["1.", "Space"]] },
      { action: "To-do", keys: [["[]", "Space"]] },
      { action: "Quote", keys: [[">", "Space"]] },
      { action: "Divider", keys: [["---", "Space"]] },
    ],
  },
];

/** Modifier labels on macOS. */
const MAC_LABELS: Readonly<Record<string, string>> = { Mod: "⌘", Shift: "⇧", Alt: "⌥" };

/**
 * The labels of `combo`'s keys on `os`: `Mod` is Ctrl, or ⌘ on macOS, where
 * Shift and Alt are ⇧ and ⌥ as well.
 */
export function keyLabels(combo: KeyCombo, os: DesktopOs): string[] {
  return combo.map((key) => {
    if (os === "macos") return MAC_LABELS[key] ?? key;
    return key === "Mod" ? "Ctrl" : key;
  });
}

/**
 * True for the shortcut-reference key, Ctrl+/ (Command+/ on macOS), when
 * nothing else handled it. `/` may need Shift on some keyboard layouts.
 */
export function isShortcutsKey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}): boolean {
  if (event.defaultPrevented || event.altKey) return false;
  return (event.ctrlKey || event.metaKey) && event.key === "/";
}
