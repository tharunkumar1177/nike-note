/**
 * Unit tests for Visual lines: which link lines become Visual blocks, the
 * line written for a saved HTML file, and byte-exact round trips.
 */
import { describe, expect, it } from "vitest";

import { parseDocument, serializeDocument } from "../src/blocks";
import { parseVisualLine, visualLine } from "../src/visual";

describe("parseVisualLine", () => {
  it("reads a link to an HTML file in the page's assets folder", () => {
    expect(parseVisualLine("[Git merge vs rebase](assets/merge-vs-rebase.html)")).toEqual({
      title: "Git merge vs rebase",
      src: "assets/merge-vs-rebase.html",
    });
    expect(parseVisualLine("  [Orbit](./assets/Orbit%20demo.HTM)  ")).toEqual({
      title: "Orbit",
      src: "./assets/Orbit%20demo.HTM",
    });
    expect(parseVisualLine("[Orbit](<assets/Orbit demo.html>)")).toEqual({
      title: "Orbit",
      src: "assets/Orbit demo.html",
    });
    expect(parseVisualLine("[](assets/a.html)")).toEqual({ title: "", src: "assets/a.html" });
  });

  it("leaves other links as they are", () => {
    expect(parseVisualLine("[a](assets/a.png)")).toBeNull();
    expect(parseVisualLine("[a](a.html)")).toBeNull();
    expect(parseVisualLine("[a](other/assets/a.html)")).toBeNull();
    expect(parseVisualLine("[a](assets/sub/a.html)")).toBeNull();
    expect(parseVisualLine("[a](assets/sub%2Fa.html)")).toBeNull();
    expect(parseVisualLine("[a](assets/.hidden.html)")).toBeNull();
    expect(parseVisualLine("[a](assets/../a.html)")).toBeNull();
    expect(parseVisualLine("[a](assets/a b.html)")).toBeNull();
    expect(parseVisualLine("[a](assets/%E0%A4%A.html)")).toBeNull();
    expect(parseVisualLine("[a](https://example.com/assets/a.html)")).toBeNull();
    expect(parseVisualLine("[a](x) and [b](assets/b.html)")).toBeNull();
    expect(parseVisualLine("see [a](assets/a.html)")).toBeNull();
    expect(parseVisualLine("![a](assets/a.html)")).toBeNull();
  });
});

describe("visualLine", () => {
  it("writes a line that reads back as the same file", () => {
    const line = visualLine("Merge [vs] rebase", "Merge vs rebase (2).html");
    expect(line).toBe("[Merge vs rebase](assets/Merge%20vs%20rebase%20%282%29.html)");
    expect(parseVisualLine(line)).toEqual({
      title: "Merge vs rebase",
      src: "assets/Merge%20vs%20rebase%20%282%29.html",
    });
  });

  it("falls back to the file name for an empty title", () => {
    expect(visualLine(" \n ", "orbit.html")).toBe("[orbit](assets/orbit.html)");
  });
});

describe("visual blocks", () => {
  it("parse as their own block and round-trip byte for byte", () => {
    const source = "\uFEFF# Git\r\n\r\n[Merge vs rebase](assets/merge.html)\r\n- [Child](child/README.md)\r\n";
    const document = parseDocument(source);
    expect(document.blocks.map((block) => block.type)).toEqual(["heading", "text", "visual", "bullet"]);
    expect(document.blocks[2]).toMatchObject({
      type: "visual",
      title: "Merge vs rebase",
      src: "assets/merge.html",
      line: 2,
    });
    expect(serializeDocument(document)).toBe(source);
  });

  it("keep sub-page links as page blocks", () => {
    expect(parseDocument("[Child](child/README.md)\n").blocks[0]?.type).toBe("page");
  });
});
