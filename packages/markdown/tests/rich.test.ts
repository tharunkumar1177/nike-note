/**
 * Unit tests for rich blocks: images, callouts, toggles, table cells, the
 * slash-menu templates, and file links.
 */
import { describe, expect, it } from "vitest";

import { parseDocument, serializeDocument } from "../src/blocks";
import { insertTemplate } from "../src/edit";
import { assetImageLine, resolveFileHref, resolvePageHref } from "../src/links";
import { parseTable, splitRow } from "../src/table";

/** The blocks of `source` without their source positions. */
function shapes(source: string): unknown[] {
  return parseDocument(source).blocks.map((block) =>
    Object.fromEntries(Object.entries(block).filter(([key]) => key !== "raw" && key !== "line")),
  );
}

describe("image blocks", () => {
  it("reads a line that is only an image", () => {
    expect(shapes('![Map of Kyoto](assets/kyoto%20map.png "Day 1")\n')).toEqual([
      {
        type: "image",
        alt: "Map of Kyoto",
        src: "assets/kyoto%20map.png",
        title: "Day 1",
        width: null,
        align: "left",
      },
    ]);
    expect(shapes("![a \\] b](<assets/a b.png>)")).toEqual([
      { type: "image", alt: "a ] b", src: "assets/a b.png", title: "", width: null, align: "left" },
    ]);
    expect(shapes("![x](assets/f(1).png)")[0]).toMatchObject({ src: "assets/f(1).png" });
  });

  it("leaves images inside other text as text", () => {
    expect(shapes("see ![a](a.png)")[0]).toMatchObject({ type: "text" });
    expect(shapes("![a](a.png) after")[0]).toMatchObject({ type: "text" });
    expect(shapes("- ![a](a.png)")[0]).toMatchObject({ type: "bullet" });
  });

  it("writes an image line for a saved file", () => {
    expect(assetImageLine("Screen shot (2).png")).toBe(
      "![Screen shot (2)](assets/Screen%20shot%20%282%29.png)",
    );
    expect(shapes(assetImageLine("a [b].png"))[0]).toMatchObject({
      type: "image",
      alt: "a b",
      src: "assets/a%20%5Bb%5D.png",
    });
  });
});

describe("callouts", () => {
  it("joins the quote lines under an alert marker", () => {
    const source = "> [!warning]\r\n> Pack **light**\r\n>\r\n> No liquids\r\nafter\r\n";
    expect(shapes(source)).toEqual([
      { type: "callout", kind: "warning", text: "Pack **light**\n\nNo liquids" },
      { type: "text", text: "after" },
    ]);
    expect(serializeDocument(parseDocument(source))).toBe(source);
  });

  it("keeps a quote without a known marker a quote", () => {
    expect(shapes("> [!aside]\n")[0]).toMatchObject({ type: "quote" });
    expect(shapes("> [!NOTE] text\n")[0]).toMatchObject({ type: "quote" });
  });
});

describe("toggles", () => {
  it("reads a details block with its summary and body", () => {
    const source =
      "<details open>\n<summary>Packing *list*</summary>\n\n- passport\n<details>\n<summary>Inner</summary>\nx\n</details>\n\n</details>\nend\n";
    expect(shapes(source)).toEqual([
      {
        type: "toggle",
        open: true,
        summary: "Packing *list*",
        body: "- passport\n<details>\n<summary>Inner</summary>\nx\n</details>",
      },
      { type: "text", text: "end" },
    ]);
    expect(serializeDocument(parseDocument(source))).toBe(source);
  });

  it("leaves an unclosed details line as text", () => {
    expect(shapes("<details>\n<summary>A</summary>\nbody\n")[0]).toMatchObject({ type: "text" });
  });
});

describe("table cells", () => {
  it("splits rows with optional outer pipes and escaped pipes", () => {
    expect(splitRow("| a | b \\| c | `x` |")).toEqual(["a", "b | c", "`x`"]);
    expect(splitRow("a|b")).toEqual(["a", "b"]);
    expect(splitRow("| a |  |")).toEqual(["a", ""]);
    expect(splitRow("a \\* b")).toEqual(["a \\* b"]);
  });

  it("reads alignment and fits rows to the header", () => {
    expect(parseTable("| A | B | C |\n|:--|:-:|--:|\n| 1 |\n| 1 | 2 | 3 | 4 |")).toEqual({
      align: ["left", "center", "right"],
      header: ["A", "B", "C"],
      rows: [
        ["1", "", ""],
        ["1", "2", "3"],
      ],
    });
  });
});

describe("insertTemplate", () => {
  it("replaces an empty line and keeps a line with words", () => {
    const empty = parseDocument("# T\r\n\r\n");
    expect(insertTemplate(empty, 1, "", "callout")).toEqual({
      source: "# T\r\n> [!NOTE]\r\n> \r\n",
      caret: { line: 2, column: 2 },
    });
    const worded = parseDocument("# T\nIntro");
    const table = insertTemplate(worded, 1, "Intro", "table");
    expect(table?.source).toBe("# T\nIntro\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n");
    expect(table?.caret).toEqual({ line: 4, column: 2 });
    const toggle = insertTemplate(parseDocument("- "), 0, "- ", "toggle");
    expect(parseDocument(toggle?.source ?? "").blocks[0]).toMatchObject({
      type: "toggle",
      summary: "Toggle",
    });
  });

  it("refuses multi-line blocks", () => {
    expect(insertTemplate(parseDocument("```\nx\n```\n"), 0, "```", "table")).toBeNull();
  });
});

describe("file links", () => {
  it("resolves relative files inside the notes folder only", () => {
    expect(resolveFileHref("Trips/Japan", "assets/a%20b.png?v=2#top")).toBe(
      "Trips/Japan/assets/a b.png",
    );
    expect(resolveFileHref("Trips", "../shared/x.png")).toBe("shared/x.png");
    expect(resolveFileHref("", "<assets/a b.png>")).toBe("assets/a b.png");
    for (const href of ["../x.png", "https://a/x.png", "/x.png", "#x", "a\\b.png", "%zz"]) {
      expect(resolveFileHref("", href)).toBeNull();
    }
  });

  it("still resolves page links to page paths", () => {
    expect(resolvePageHref("Trips", "Japan/README.md#day-1")).toBe("Trips/Japan");
    expect(resolvePageHref("Trips", "../README.md")).toBe("");
    expect(resolvePageHref("Trips", "notes.md")).toBeNull();
  });
});
