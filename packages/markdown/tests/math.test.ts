/**
 * Unit tests for math: block equations in their three forms, the form an
 * edited equation is written back in, inline `$…$` math as GitHub reads it,
 * and turning an inline equation on and off for a selection.
 */
import { describe, expect, it } from "vitest";

import { parseDocument, serializeDocument, type Block } from "../src/blocks";
import { insertTemplate, isSingleLine, setMath } from "../src/edit";
import { formatsAt, toggleMark } from "../src/format";
import { parseInline } from "../src/inline";
import { mathSource } from "../src/math";

/** The blocks of `source` without their raw text and line numbers. */
function shapes(source: string): Partial<Block>[] {
  return parseDocument(source).blocks.map(
    (block) =>
      Object.fromEntries(
        Object.entries(block).filter(([key]) => key !== "raw" && key !== "line"),
      ) as Partial<Block>,
  );
}

const CAUCHY = "\\left( \\sum_{k=1}^n a_k b_k \\right)^2 \\leq \\left( \\sum_{k=1}^n a_k^2 \\right)";

describe("block equations", () => {
  it("reads $$ lines, one $$…$$ line, and a math fence", () => {
    expect(shapes(`$$\n${CAUCHY}\n$$\n`)).toEqual([{ type: "math", tex: CAUCHY, form: "dollars" }]);
    expect(shapes("$$ e^{i\\pi} + 1 = 0 $$\n")).toEqual([
      { type: "math", tex: " e^{i\\pi} + 1 = 0 ", form: "line" },
    ]);
    expect(shapes("```math\na^2\n+ b^2\n```\n")).toEqual([
      { type: "math", tex: "a^2\n+ b^2", form: "fence" },
    ]);
    expect(shapes("~~~ MATH\nx\n~~~\n")).toEqual([{ type: "math", tex: "x", form: "fence" }]);
    expect(shapes("$$\n$$\n")).toEqual([{ type: "math", tex: "", form: "dollars" }]);
  });

  it("is one block that keeps its source and is not edited as one line", () => {
    const source = "\uFEFF# Proof\r\nBefore\r\n$$\r\nx = 1\r\n$$\r\nAfter\r\n";
    const document = parseDocument(source);
    expect(document.blocks.map((block) => block.type)).toEqual(["heading", "text", "math", "text"]);
    expect(document.blocks[2]?.line).toBe(2);
    expect(isSingleLine(document.blocks[2] as Block)).toBe(false);
    expect(serializeDocument(document)).toBe(source);
  });

  it("leaves $$ as text when the equation never closes or has an empty line", () => {
    expect(shapes("$$\nx\n").map((block) => block.type)).toEqual(["text", "text"]);
    expect(shapes("$$\na\n\nb\n$$\n").map((block) => block.type)).toEqual([
      "text",
      "text",
      "text",
      "text",
      "text",
    ]);
    expect(shapes("$$ a $$ b $$\n")).toEqual([{ type: "text", text: "$$ a $$ b $$" }]);
    expect(shapes("$$$$\n")).toEqual([{ type: "text", text: "$$$$" }]);
    expect(shapes("```\n$$\nx\n$$\n```\n")).toEqual([
      { type: "code", language: "", code: "$$\nx\n$$", closed: true },
    ]);
  });
});

describe("mathSource", () => {
  it("keeps the form the TeX fits", () => {
    expect(mathSource("a\nb", "dollars")).toBe("$$\na\nb\n$$");
    expect(mathSource("", "dollars")).toBe("$$\n$$");
    expect(mathSource("x^2", "line")).toBe("$$x^2$$");
    expect(mathSource("x^2", "fence")).toBe("```math\nx^2\n```");
    expect(mathSource("", "fence")).toBe("```math\n```");
  });

  it("falls back when the TeX does not fit", () => {
    expect(mathSource("a\nb", "line")).toBe("$$\na\nb\n$$");
    expect(mathSource("\\$5", "line")).toBe("$$\n\\$5\n$$");
    expect(mathSource("a\n\nb", "dollars")).toBe("```math\na\n\nb\n```");
    expect(mathSource("a\n$$", "dollars")).toBe("```math\na\n$$\n```");
    expect(mathSource("```\nx", "dollars")).toBe("````math\n```\nx\n````");
  });

  it("reads back what it writes", () => {
    const samples = ["a\nb", "", "x^2", " y ", "a\n\nb", "````\n", "\\text{$}"];
    for (const tex of samples) {
      for (const form of ["dollars", "line", "fence"] as const) {
        const block = parseDocument(`${mathSource(tex, form)}\n`).blocks[0];
        expect(block?.type === "math" ? block.tex : null).toBe(tex);
      }
    }
  });
});

describe("setMath", () => {
  it("rewrites only the equation and keeps line endings", () => {
    const document = parseDocument("# T\r\n$$\r\nx\r\n$$\r\nafter\r\n");
    expect(setMath(document, 1, "x + y\n= z")).toBe("# T\r\n$$\r\nx + y\r\n= z\r\n$$\r\nafter\r\n");
    expect(setMath(document, 2, "x")).toBeNull();
  });

  it("goes back to the form editing started in once the TeX fits it", () => {
    const fenced = parseDocument(setMath(parseDocument("$$\nx\n$$\n"), 0, "x\n") ?? "");
    expect(serializeDocument(fenced)).toBe("```math\nx\n\n```\n");
    expect(setMath(fenced, 0, "x\n= y", "dollars")).toBe("$$\nx\n= y\n$$\n");
    expect(setMath(fenced, 0, "x\n= y")).toBe("```math\nx\n= y\n```\n");
  });

  it("closes an unclosed math fence", () => {
    expect(setMath(parseDocument("```math\na"), 0, "b")).toBe("```math\nb\n```");
  });

  it("adds an empty equation from the slash menu template", () => {
    const document = parseDocument("# T\nIntro\n");
    expect(insertTemplate(document, 1, "", "math")).toEqual({
      source: "# T\n$$\n$$\n",
      caret: { line: 1, column: 0 },
    });
    expect(insertTemplate(document, 1, "Intro", "math")?.source).toBe("# T\nIntro\n$$\n$$\n");
  });
});

describe("inline math", () => {
  it("reads $…$ and $`…`$", () => {
    expect(parseInline("Inline: $\\sqrt{3x-1}+(1+x)^2$.")).toEqual([
      { type: "text", text: "Inline: " },
      { type: "math", text: "\\sqrt{3x-1}+(1+x)^2" },
      { type: "text", text: "." },
    ]);
    expect(parseInline("$`a$b`$")).toEqual([{ type: "math", text: "a$b" }]);
    expect(parseInline("**$x$**")).toEqual([
      { type: "bold", children: [{ type: "math", text: "x" }] },
    ]);
    expect(parseInline("$a\\$b$")).toEqual([{ type: "math", text: "a\\$b" }]);
  });

  it("leaves prices, escapes, doubled dollars, and spaced dollars as text", () => {
    const texts = ["$5 and $10", "costs $ 5$", "\\$x$", "$x $", "$$x$$", "`$x$`", "a $", "$x$5"];
    for (const text of texts) {
      expect(parseInline(text).some((node) => node.type === "math")).toBe(false);
    }
  });

  it("keeps the TeX from being read as other styles", () => {
    expect(parseInline("$a_1 * b_2 * c$")).toEqual([{ type: "math", text: "a_1 * b_2 * c" }]);
  });
});

describe("inline equation formatting", () => {
  it("wraps a selection in $ and reports it", () => {
    expect(toggleMark("so x^2 here", 3, 6, "math")).toEqual({ text: "so $x^2$ here", start: 4, end: 7 });
    expect(formatsAt("so $x^2$ here", 4, 7).marks.has("math")).toBe(true);
    expect(formatsAt("so $x^2$ here", 4, 7).inCode).toBe(true);
  });

  it("uses $`…`$ when plain dollars would not read back", () => {
    expect(toggleMark("pay a$b now", 4, 7, "math").text).toBe("pay $`a$b`$ now");
    expect(toggleMark("x2", 0, 1, "math").text).toBe("$`x`$2");
  });

  it("unwraps the whole equation and leaves other styles off inside it", () => {
    expect(toggleMark("so $x^2 + 1$ here", 5, 6, "math")).toEqual({
      text: "so x^2 + 1 here",
      start: 3,
      end: 10,
    });
    expect(toggleMark("$x$", 1, 2, "bold")).toEqual({ text: "$x$", start: 1, end: 2 });
  });

  it("adds and removes an empty pair at a caret", () => {
    expect(toggleMark("ab", 1, 1, "math")).toEqual({ text: "a$$b", start: 2, end: 2 });
    expect(toggleMark("a$$b", 2, 2, "math")).toEqual({ text: "ab", start: 1, end: 1 });
  });
});
