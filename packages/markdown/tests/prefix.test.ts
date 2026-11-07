/**
 * Unit tests for splitting a line's block marker from its text and for the
 * typing shortcuts that turn plain lines into to-dos and quotes.
 */
import { describe, expect, it } from "vitest";

import { applyShortcut, nestedIndent, splitLine } from "../src/prefix";

describe("splitLine", () => {
  it("separates each marker from the text after it", () => {
    expect(splitLine("## Plans")).toMatchObject({
      kind: "heading",
      prefix: "## ",
      content: "Plans",
      level: 2,
    });
    expect(splitLine("  * [x] Packed")).toMatchObject({
      kind: "todo",
      prefix: "  * [x] ",
      content: "Packed",
      indent: "  ",
      checked: true,
    });
    expect(splitLine("- Tokyo")).toMatchObject({ kind: "bullet", prefix: "- ", content: "Tokyo" });
    expect(splitLine("12) Kyoto")).toMatchObject({ kind: "numbered", prefix: "12) " });
    expect(splitLine("> Quote")).toMatchObject({ kind: "quote", prefix: "> ", content: "Quote" });
    expect(splitLine("- ")).toMatchObject({ kind: "bullet", content: "" });
  });

  it("needs a space after the marker", () => {
    for (const line of ["-5 degrees", "#tag", "1.5 days", ">", "plain"]) {
      expect(splitLine(line)).toMatchObject({ kind: "text", prefix: "", content: line });
    }
    expect(splitLine("- [ ]")).toMatchObject({ kind: "bullet", content: "[ ]" });
  });

  it("leaves dividers and multi-line text alone", () => {
    expect(splitLine("- - -").kind).toBe("text");
    expect(splitLine("***").kind).toBe("text");
    expect(splitLine("- a\nb").kind).toBe("text");
  });
});

describe("nestedIndent", () => {
  it("lines a child up with the parent's text", () => {
    expect(nestedIndent(splitLine("- a"))).toBe("  ");
    expect(nestedIndent(splitLine("  - [ ] a"))).toBe("    ");
    expect(nestedIndent(splitLine("10. a"))).toBe("    ");
    expect(nestedIndent(splitLine("1) a"))).toBe("   ");
  });
});

describe("applyShortcut", () => {
  it("turns [] and [x] into to-dos and a quote mark into a quote", () => {
    expect(applyShortcut("[] ", 3)).toBe("- [ ] ");
    expect(applyShortcut("[ ] Buy tickets", 4)).toBe("- [ ] Buy tickets");
    expect(applyShortcut("[X] ", 4)).toBe("- [x] ");
    expect(applyShortcut('" Said', 2)).toBe("> Said");
  });

  it("fires only when the shortcut was just typed into plain text", () => {
    expect(applyShortcut("[] ", 2)).toBeNull();
    expect(applyShortcut("[] later", 8)).toBeNull();
    expect(applyShortcut("- [] ", 5)).toBeNull();
    expect(applyShortcut("[link] ", 7)).toBeNull();
    expect(applyShortcut("plain", 5)).toBeNull();
  });
});
