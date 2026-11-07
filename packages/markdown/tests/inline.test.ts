/**
 * Unit tests for inline Markdown parsing.
 */
import { describe, expect, it } from "vitest";

import { inlineText, parseInline } from "../src/inline";

describe("parseInline", () => {
  it("parses emphasis, strikethrough, and code", () => {
    expect(parseInline("a **b** *c* _d_ ~~e~~ `f`")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "italic", children: [{ type: "text", text: "c" }] },
      { type: "text", text: " " },
      { type: "italic", children: [{ type: "text", text: "d" }] },
      { type: "text", text: " " },
      { type: "strike", children: [{ type: "text", text: "e" }] },
      { type: "text", text: " " },
      { type: "code", text: "f" },
    ]);
  });

  it("nests emphasis", () => {
    expect(parseInline("*a **b** c*")).toEqual([
      {
        type: "italic",
        children: [
          { type: "text", text: "a " },
          { type: "bold", children: [{ type: "text", text: "b" }] },
          { type: "text", text: " c" },
        ],
      },
    ]);
  });

  it("leaves unmatched and intraword delimiters as text", () => {
    expect(parseInline("2 * 3 * 4")).toEqual([{ type: "text", text: "2 * 3 * 4" }]);
    expect(parseInline("snake_case_name")).toEqual([{ type: "text", text: "snake_case_name" }]);
    expect(parseInline("**open")).toEqual([{ type: "text", text: "**open" }]);
    expect(parseInline("~single~")).toEqual([{ type: "text", text: "~single~" }]);
  });

  it("does not parse inside code spans and honors escapes", () => {
    expect(parseInline("`` a `*b*` ``")).toEqual([{ type: "code", text: "a `*b*`" }]);
    expect(parseInline("\\*not italic\\*")).toEqual([{ type: "text", text: "*not italic*" }]);
    expect(parseInline("`unclosed")).toEqual([{ type: "text", text: "`unclosed" }]);
  });

  it("parses links with nested labels, angle destinations, and titles", () => {
    expect(parseInline('[**Go** here](https://example.com/a_(b) "Title")')).toEqual([
      {
        type: "link",
        href: "https://example.com/a_(b)",
        children: [
          { type: "bold", children: [{ type: "text", text: "Go" }] },
          { type: "text", text: " here" },
        ],
      },
    ]);
    expect(parseInline("[Japan](<Japan 2027/README.md>)")).toEqual([
      { type: "link", href: "Japan 2027/README.md", children: [{ type: "text", text: "Japan" }] },
    ]);
    expect(parseInline("[not](a link)")).toEqual([{ type: "text", text: "[not](a link)" }]);
  });

  it("keeps images as source text until image blocks exist", () => {
    expect(parseInline("![map](assets/map.png) end")).toEqual([
      { type: "text", text: "![map](assets/map.png) end" },
    ]);
  });

  it("links bare and bracketed web addresses", () => {
    expect(parseInline("see https://example.com/x, or <mailto:a@b.c>.")).toEqual([
      { type: "text", text: "see " },
      {
        type: "link",
        href: "https://example.com/x",
        children: [{ type: "text", text: "https://example.com/x" }],
      },
      { type: "text", text: ", or " },
      { type: "link", href: "mailto:a@b.c", children: [{ type: "text", text: "mailto:a@b.c" }] },
      { type: "text", text: "." },
    ]);
  });

  it("stops nesting at a safe depth", () => {
    const deep = "*".repeat(200) + "x" + "*".repeat(200);
    expect(inlineText(parseInline(deep)).includes("x")).toBe(true);
  });
});

describe("inlineText", () => {
  it("returns the visible text", () => {
    expect(inlineText(parseInline("**Trip** to [Japan](x) `2027`"))).toBe("Trip to Japan 2027");
  });
});
