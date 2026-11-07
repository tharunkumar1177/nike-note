/**
 * Unit tests for slash menu filtering: every roadmap command is found by its
 * name, the best match comes first, and unknown text matches nothing.
 */
import { describe, expect, it } from "vitest";

import { SLASH_ITEMS, filterSlashItems } from "../src/shared/slash";

/** Commands matching `query`, in the order shown. */
function commands(query: string): string[] {
  return filterSlashItems(query).map((item) => item.command);
}

describe("filterSlashItems", () => {
  it("lists every command for an empty query", () => {
    expect(commands("")).toHaveLength(SLASH_ITEMS.length);
  });

  it("finds each command by its slash name first", () => {
    for (const name of [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "quote",
      "bullet",
      "numbered",
      "todo",
      "code",
      "divider",
      "text",
      "page",
    ]) {
      expect(commands(name)[0]).toBe(name);
    }
  });

  it("matches labels without case or spaces and by keyword", () => {
    expect(commands("Heading 3")[0]).toBe("h3");
    expect(commands("list")).toEqual(["bullet", "numbered", "todo"]);
    expect(commands("HR")).toEqual(["divider"]);
    expect(commands("eadi")).toEqual(["h1", "h2", "h3", "h4", "h5", "h6"]);
  });

  it("matches nothing for unknown text", () => {
    expect(commands("zzz")).toEqual([]);
  });
});
