/**
 * Unit tests for block parsing, list nesting, multi-line blocks, and exact round trips.
 */
import { describe, expect, it } from "vitest";

import {
  listNumbers,
  parseDocument,
  serializeDocument,
  titleBlockIndex,
  type Block,
} from "../src/blocks";
import { splitLines } from "../src/lines";

/**
 * Parse and drop the source positions to keep expectations short.
 */
function shapes(source: string): Record<string, unknown>[] {
  return parseDocument(source).blocks.map((block: Block) =>
    Object.fromEntries(Object.entries(block).filter(([key]) => key !== "raw" && key !== "line")),
  );
}

describe("splitLines", () => {
  it("keeps each line ending and no phantom last line", () => {
    expect(splitLines("a\r\nb\nc")).toEqual([
      { text: "a", eol: "\r\n" },
      { text: "b", eol: "\n" },
      { text: "c", eol: "" },
    ]);
    expect(splitLines("a\n")).toEqual([{ text: "a", eol: "\n" }]);
    expect(splitLines("")).toEqual([]);
    expect(splitLines("\n\n")).toEqual([
      { text: "", eol: "\n" },
      { text: "", eol: "\n" },
    ]);
  });
});

describe("parseDocument", () => {
  it("maps each line to one block", () => {
    expect(
      shapes(
        "# Trip\n## Plan\n> Pack light\n- passport\n- [x] visa\n1. Tokyo\n---\n[Hotels](hotels/README.md)\n\nplain *text*",
      ),
    ).toEqual([
      { type: "heading", level: 1, text: "Trip" },
      { type: "heading", level: 2, text: "Plan" },
      { type: "quote", text: "Pack light" },
      { type: "bullet", depth: 0, text: "passport" },
      { type: "todo", depth: 0, checked: true, text: "visa" },
      { type: "numbered", depth: 0, number: 1, text: "Tokyo" },
      { type: "divider" },
      { type: "page", title: "Hotels", folder: "hotels" },
      { type: "text", text: "" },
      { type: "text", text: "plain *text*" },
    ]);
  });

  it("does not mistake look-alikes for markers", () => {
    expect(shapes("#hashtag\n**bold** start\n-dash\n####### seven\n+1 agree")).toEqual([
      { type: "text", text: "#hashtag" },
      { type: "text", text: "**bold** start" },
      { type: "text", text: "-dash" },
      { type: "text", text: "####### seven" },
      { type: "text", text: "+1 agree" },
    ]);
  });

  it("strips closing heading hashes but keeps hashes inside words", () => {
    expect(shapes("# Closed ##\n# C#\n###")).toEqual([
      { type: "heading", level: 1, text: "Closed" },
      { type: "heading", level: 1, text: "C#" },
      { type: "heading", level: 3, text: "" },
    ]);
  });

  it("nests lists by relative indentation for two- and four-space styles", () => {
    const depths = (source: string) =>
      parseDocument(source).blocks.map((block) => ("depth" in block ? block.depth : null));
    expect(depths("- a\n  - b\n    - c\n  - d\n- e")).toEqual([0, 1, 2, 1, 0]);
    expect(depths("- a\n    - b\n\n    - c\n- d")).toEqual([0, 1, null, 1, 0]);
    expect(depths("1. a\n\t- b\ntext\n  - c")).toEqual([0, 1, null, 0]);
  });

  it("keeps fenced code as one block, including unclosed fences", () => {
    expect(shapes("```ts title\nconst a = 1;\n\n# not a heading\n```\nafter")).toEqual([
      { type: "code", language: "ts", code: "const a = 1;\n\n# not a heading", closed: true },
      { type: "text", text: "after" },
    ]);
    expect(shapes("~~~~\n~~~\nstill code")).toEqual([
      { type: "code", language: "", code: "~~~\nstill code", closed: false },
    ]);
    expect(shapes("``` `x` ```")).toEqual([{ type: "text", text: "``` `x` ```" }]);
  });

  it("keeps front matter and tables as one block each", () => {
    expect(shapes("---\ntitle: Trip\n---\n| a | b |\n|---|:-:|\n| 1 | 2 |\n\nnext")).toEqual([
      { type: "frontMatter", yaml: "title: Trip" },
      { type: "table", source: "| a | b |\n|---|:-:|\n| 1 | 2 |" },
      { type: "text", text: "" },
      { type: "text", text: "next" },
    ]);
    expect(shapes("---\nno closing")).toEqual([
      { type: "divider" },
      { type: "text", text: "no closing" },
    ]);
  });

  it("records the byte-order mark and the dominant line ending", () => {
    const document = parseDocument("\uFEFF# Title\r\nbody\r\nlast\n");
    expect(document.bom).toBe(true);
    expect(document.eol).toBe("\r\n");
    expect(document.blocks[0]).toMatchObject({ type: "heading", text: "Title", line: 0 });
    expect(parseDocument("").blocks).toEqual([]);
  });

  it("finds the title block the way the page tree does", () => {
    expect(titleBlockIndex(parseDocument("intro\n## Sub\n# Title\n# Second").blocks)).toBe(2);
    expect(titleBlockIndex(parseDocument("```\n# code\n```\n  # indented").blocks)).toBe(-1);
  });
});

describe("listNumbers", () => {
  it("continues runs across blank lines and nested items, and restarts after other blocks", () => {
    const blocks = parseDocument("3. a\n\n7. b\n   1. x\n   1. y\n9. c\ntext\n1. d\n- e\n1. f").blocks;
    const numbers = listNumbers(blocks);
    const shown = blocks.flatMap((block, index) =>
      block.type === "numbered" ? [`${block.text}=${numbers.get(index)}`] : [],
    );
    expect(shown).toEqual(["a=3", "b=4", "x=1", "y=2", "c=5", "d=1", "f=1"]);
  });
});

describe("serializeDocument", () => {
  it("reproduces hand-picked tricky documents exactly", () => {
    for (const source of [
      "",
      "\n",
      "no newline at end",
      "\uFEFF# BOM\r\nmixed\nendings\r\n",
      "---\na: 1\n...\nbody",
      "```\nunclosed\n",
      "|a|\n|-|\n|1|",
      "  lone \r carriage\n\t\ttabs\n",
    ]) {
      expect(serializeDocument(parseDocument(source))).toBe(source);
    }
  });

  it("reproduces generated documents exactly", () => {
    const pieces = [
      "# ", "## ", "- ", "  - ", "1. ", "- [ ] ", "> ", "---", "```", "~~~", "|", "|-|",
      "text", "*", "[a](b/README.md)", "\t", " ", "\r", "\uFEFF", "é", "😀",
    ];
    const endings = ["\n", "\r\n", ""];
    let seed = 42;
    const random = (limit: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % limit;
    };
    for (let round = 0; round < 500; round += 1) {
      let source = "";
      const lineCount = random(12);
      for (let line = 0; line < lineCount; line += 1) {
        const partCount = random(4);
        for (let part = 0; part < partCount; part += 1) source += pieces[random(pieces.length)];
        source += endings[random(endings.length)];
      }
      expect(serializeDocument(parseDocument(source))).toBe(source);
    }
  });
});
