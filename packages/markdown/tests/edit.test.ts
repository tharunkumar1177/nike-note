/**
 * Unit tests for source edits: only touched lines change, line endings are
 * kept, and list, title, and caret rules hold.
 */
import { describe, expect, it } from "vitest";

import { parseDocument } from "../src/blocks";
import {
  blockAtLine,
  blockLineCount,
  blockText,
  clearPrefix,
  indentItem,
  insertDivider,
  insertLines,
  mergeWithPrevious,
  offsetInBlock,
  positionInText,
  removeBlock,
  replaceBlockText,
  setTitle,
  splitBlock,
  titleText,
  toggleTodo,
} from "../src/edit";

/** Index of the first block whose text is `text`. */
function indexOf(source: string, text: string): number {
  return parseDocument(source).blocks.findIndex((block) => blockText(block) === text);
}

describe("block text and positions", () => {
  const source = "\uFEFF# Trip\r\n```js\r\nlet a;\r\nlet b;\r\n```\r\nlast";
  const { blocks } = parseDocument(source);

  it("covers every line of a block, with or without a final ending", () => {
    expect(blocks.map(blockLineCount)).toEqual([1, 4, 1]);
    expect(blocks.map(blockText)).toEqual(["# Trip", "```js\nlet a;\nlet b;\n```", "last"]);
    expect(blockAtLine(blocks, 3)).toBe(1);
    expect(blockAtLine(blocks, 5)).toBe(2);
    expect(blockAtLine(blocks, 6)).toBe(-1);
  });

  it("maps carets between offsets and source positions", () => {
    const code = blocks[1];
    if (!code) throw new Error("missing block");
    expect(offsetInBlock(code, { line: 2, column: 3 })).toBe(6 + 3);
    expect(offsetInBlock(code, { line: 9, column: 99 })).toBe(blockText(code).length);
    expect(positionInText(1, blockText(code), 16)).toEqual({ line: 3, column: 3 });
  });
});

describe("replaceBlockText", () => {
  it("rewrites only the edited lines and keeps their line ending", () => {
    const source = "\uFEFF# Trip\r\nTokyo\r\nKyoto\n";
    const document = parseDocument(source);
    expect(replaceBlockText(document, 1, "Tokyo, then Osaka")).toBe(
      "\uFEFF# Trip\r\nTokyo, then Osaka\r\nKyoto\n",
    );
    expect(replaceBlockText(document, 2, "Kyoto\nNara")).toBe(
      "\uFEFF# Trip\r\nTokyo\r\nKyoto\nNara\n",
    );
  });

  it("closes a code fence typed into a one-line block", () => {
    const document = parseDocument("a\n  b\nc\n");
    const source = replaceBlockText(document, 1, "  ```py");
    expect(source).toBe("a\n  ```py\n  ```\nc\n");
    expect(parseDocument(source).blocks.map((block) => block.type)).toEqual([
      "text",
      "code",
      "text",
    ]);
    expect(replaceBlockText(document, 1, "``` `x`")).toBe("a\n``` `x`\nc\n");
  });
});

describe("insertLines and removeBlock", () => {
  it("adds a line ending to a last line before appending", () => {
    const document = parseDocument("a\r\nb");
    expect(insertLines(document, 2, "")).toBe("a\r\nb\r\n\r\n");
    expect(insertLines(document, 0, "z")).toBe("z\r\na\r\nb");
    expect(insertLines(parseDocument(""), 0, "first")).toBe("first\n");
    expect(removeBlock(document, 0)).toBe("b");
  });
});

describe("splitBlock", () => {
  it("moves the text after the caret to a new line", () => {
    const source = "# Trip\nTokyo Kyoto\n";
    const document = parseDocument(source);
    expect(splitBlock(document, 1, "Tokyo Kyoto", 5)).toEqual({
      source: "# Trip\nTokyo\n Kyoto\n",
      caret: { line: 2, column: 0 },
    });
  });

  it("continues bullet, to-do, and numbered lists", () => {
    const source = "- one\n  * [x] two\n9) nine\n";
    const document = parseDocument(source);
    expect(splitBlock(document, 0, "- one", 5).source).toBe("- one\n- \n  * [x] two\n9) nine\n");
    expect(splitBlock(document, 1, "  * [x] two", 11)).toEqual({
      source: "- one\n  * [x] two\n  * [ ] \n9) nine\n",
      caret: { line: 2, column: 8 },
    });
    expect(splitBlock(document, 2, "9) nine", 7).source).toBe("- one\n  * [x] two\n9) nine\n10) \n");
  });

  it("moves an empty item out one level, then ends the list", () => {
    const source = "- one\n    - \n";
    const document = parseDocument(source);
    const outdented = splitBlock(document, 1, "    - ", 6);
    expect(outdented).toEqual({ source: "- one\n- \n", caret: { line: 1, column: 2 } });
    const ended = splitBlock(parseDocument(outdented.source), 1, "- ", 2);
    expect(ended).toEqual({ source: "- one\n\n", caret: { line: 1, column: 0 } });
  });

  it("does not treat a divider as a list item", () => {
    const document = parseDocument("---\n");
    expect(splitBlock(document, 0, "---", 3).source).toBe("---\n\n");
  });

  it("opens a line above a heading at its start and ends an empty heading", () => {
    const document = parseDocument("# T\n## Plans\n> \n");
    expect(splitBlock(document, 1, "## Plans", 3)).toEqual({
      source: "# T\n\n## Plans\n> \n",
      caret: { line: 2, column: 3 },
    });
    expect(splitBlock(document, 1, "## Plans", 8)).toEqual({
      source: "# T\n## Plans\n\n> \n",
      caret: { line: 2, column: 0 },
    });
    expect(splitBlock(document, 2, "> ", 2)).toEqual({
      source: "# T\n## Plans\n\n",
      caret: { line: 2, column: 0 },
    });
  });
});

describe("clearPrefix", () => {
  it("turns a list item or heading into plain text", () => {
    const document = parseDocument("  - [x] Done\r\n### Notes\r\n");
    expect(clearPrefix(document, 0)).toEqual({
      source: "Done\r\n### Notes\r\n",
      caret: { line: 0, column: 0 },
    });
    expect(clearPrefix(document, 1).source).toBe("  - [x] Done\r\nNotes\r\n");
  });
});

describe("indentItem", () => {
  it("nests an item under the one before and moves it back out", () => {
    const source = "- one\n- two\n1. three\n4. four\n";
    const document = parseDocument(source);
    const nested = indentItem(document, 1, 1);
    expect(nested).toEqual({
      source: "- one\n  - two\n1. three\n4. four\n",
      caret: { line: 1, column: 4 },
    });
    expect(indentItem(parseDocument(nested?.source ?? ""), 1, 1)).toBeNull();
    expect(indentItem(parseDocument(nested?.source ?? ""), 1, -1)?.source).toBe(source);
    expect(indentItem(document, 3, 1)).toEqual({
      source: "- one\n- two\n1. three\n   1. four\n",
      caret: { line: 3, column: 6 },
    });
  });

  it("nests under the item at the same level, after its existing children", () => {
    const document = parseDocument("1. a\n   1. b\n2. c\n");
    expect(indentItem(document, 2, 1)?.source).toBe("1. a\n   1. b\n   2. c\n");
  });

  it("leaves first items, top-level outdents, and other blocks alone", () => {
    const document = parseDocument("# T\n- one\nplain\n");
    expect(indentItem(document, 1, 1)).toBeNull();
    expect(indentItem(document, 1, -1)).toBeNull();
    expect(indentItem(document, 2, 1)).toBeNull();
  });
});

describe("insertDivider", () => {
  it("makes the line a divider and opens a line after it", () => {
    const document = parseDocument("# T\r\n---\r\nnext\r\n");
    expect(insertDivider(document, 1)).toEqual({
      source: "# T\r\n---\r\n\r\nnext\r\n",
      caret: { line: 2, column: 0 },
    });
  });
});

describe("mergeWithPrevious", () => {
  it("joins a line to the end of the one before", () => {
    const source = "# T\n- one\ntwo\n";
    expect(mergeWithPrevious(parseDocument(source), indexOf(source, "two"))).toEqual({
      source: "# T\n- onetwo\n",
      caret: { line: 1, column: 5 },
    });
  });

  it("never merges into the title or a code block, but removes an empty line there", () => {
    const source = "# T\ntext\n```\nx\n```\n\n";
    const document = parseDocument(source);
    expect(mergeWithPrevious(document, 1)).toBeNull();
    expect(mergeWithPrevious(document, 3)).toEqual({
      source: "# T\ntext\n```\nx\n```\n",
      caret: { line: 4, column: 3 },
    });
    expect(mergeWithPrevious(document, 0)).toBeNull();
  });
});

describe("toggleTodo", () => {
  it("flips only the box of the item", () => {
    const document = parseDocument("- [ ] a [x]\r\n  + [X] b\r\n");
    expect(toggleTodo(document, 0)).toBe("- [x] a [x]\r\n  + [X] b\r\n");
    expect(toggleTodo(document, 1)).toBe("- [ ] a [x]\r\n  + [ ] b\r\n");
  });
});

describe("titles", () => {
  it("reads and replaces the title line, keeping spaces as typed", () => {
    const document = parseDocument("intro\n# Trip \nbody\n");
    expect(titleText(document)).toBe("Trip ");
    expect(setTitle(document, "Trip to Japan")).toBe("intro\n# Trip to Japan\nbody\n");
  });

  it("adds a title after front matter and removes an emptied one", () => {
    const withFrontMatter = parseDocument("---\na: 1\n---\nbody\n");
    expect(titleText(withFrontMatter)).toBe("");
    expect(setTitle(withFrontMatter, "New\npage")).toBe("---\na: 1\n---\n# New page\nbody\n");
    expect(setTitle(parseDocument("# Old\nbody\n"), "  ")).toBe("body\n");
    expect(setTitle(parseDocument("body\n"), "")).toBe("body\n");
  });
});
