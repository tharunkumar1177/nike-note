/**
 * Tests for the keyboard shortcut reference: key labels per operating system,
 * the reference's own key, and the shape of the list.
 */
import { describe, expect, it } from "vitest";

import { isShortcutsKey, keyLabels, SHORTCUT_GROUPS } from "../src/shared/shortcuts";

/** A key event with no modifiers that nothing handled. */
const plain = { key: "/", ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false };

describe("keyLabels", () => {
  it("names Ctrl on Windows and Linux", () => {
    expect(keyLabels(["Mod", "Shift", "X"], "windows")).toEqual(["Ctrl", "Shift", "X"]);
    expect(keyLabels(["Mod", "K"], "linux")).toEqual(["Ctrl", "K"]);
  });

  it("uses symbols for modifiers on macOS", () => {
    expect(keyLabels(["Mod", "Shift", "↑"], "macos")).toEqual(["⌘", "⇧", "↑"]);
    expect(keyLabels(["Alt", "F2"], "macos")).toEqual(["⌥", "F2"]);
  });
});

describe("isShortcutsKey", () => {
  it("accepts Ctrl+/ and Command+/, also when / needs Shift", () => {
    expect(isShortcutsKey({ ...plain, ctrlKey: true })).toBe(true);
    expect(isShortcutsKey({ ...plain, metaKey: true })).toBe(true);
  });

  it("ignores a plain /, Alt, other keys, and handled events", () => {
    expect(isShortcutsKey(plain)).toBe(false);
    expect(isShortcutsKey({ ...plain, ctrlKey: true, altKey: true })).toBe(false);
    expect(isShortcutsKey({ ...plain, ctrlKey: true, key: "7" })).toBe(false);
    expect(isShortcutsKey({ ...plain, ctrlKey: true, defaultPrevented: true })).toBe(false);
  });
});

describe("SHORTCUT_GROUPS", () => {
  it("lists every group with unique actions and at least one key each", () => {
    const actions = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts.map((item) => item.action));
    expect(new Set(actions).size).toBe(actions.length);
    for (const group of SHORTCUT_GROUPS) {
      expect(group.shortcuts.length).toBeGreaterThan(0);
      for (const shortcut of group.shortcuts) expect(shortcut.keys.length).toBeGreaterThan(0);
    }
  });

  it("includes search and the reference itself", () => {
    const general = SHORTCUT_GROUPS[0];
    expect(general?.shortcuts.map((item) => item.action)).toEqual(
      expect.arrayContaining(["Search pages", "Show keyboard shortcuts"]),
    );
  });
});
