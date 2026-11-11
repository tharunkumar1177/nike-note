/**
 * Unit tests for inline formatting: marks toggle on and off around a
 * selection, nest so the result still parses, split when part of a styled
 * run is turned off, and links are added, changed, and removed.
 */
import { describe, expect, it } from "vitest";

import { formatsAt, linkHref, removeLink, setLink, toggleMark } from "../src/format";
import { parseInline } from "../src/inline";

describe("toggleMark", () => {
  it("wraps the selection and keeps it selected", () => {
    expect(toggleMark("make this bold", 10, 14, "bold")).toEqual({
      text: "make this **bold**",
      start: 12,
      end: 16,
    });
    expect(toggleMark("old", 0, 3, "strike")).toEqual({ text: "~~old~~", start: 2, end: 5 });
  });

  it("leaves spaces at the ends of the selection outside the delimiters", () => {
    expect(toggleMark("a word here", 1, 7, "italic").text).toBe("a *word* here");
  });

  it("nests a second style with delimiters that still parse", () => {
    const italic = toggleMark("make this **bold**", 12, 16, "italic");
    expect(italic).toEqual({ text: "make this **_bold_**", start: 13, end: 17 });
    expect(parseInline(italic.text)).toEqual([
      { type: "text", text: "make this " },
      { type: "bold", children: [{ type: "italic", children: [{ type: "text", text: "bold" }] }] },
    ]);
    expect(toggleMark(italic.text, 13, 17, "bold")).toEqual({
      text: "make this _bold_",
      start: 11,
      end: 15,
    });
  });

  it("turns a style off for part of a run and keeps it on the rest", () => {
    expect(toggleMark("**one two three**", 6, 9, "bold")).toEqual({
      text: "**one** two **three**",
      start: 8,
      end: 11,
    });
  });

  it("treats a selection of a whole styled run as its text", () => {
    expect(toggleMark("a **b** c", 2, 7, "bold")).toEqual({ text: "a b c", start: 2, end: 3 });
  });

  it("widens a selection that cuts through a styled run", () => {
    const result = toggleMark("**ab**cd", 3, 8, "italic");
    expect(result).toEqual({ text: "_**ab**cd_", start: 1, end: 9 });
    expect(parseInline(result.text)[0]?.type).toBe("italic");
  });

  it("adds a pair at a caret, removes an empty pair, and steps out of a run", () => {
    expect(toggleMark("ab", 1, 1, "bold")).toEqual({ text: "a****b", start: 3, end: 3 });
    expect(toggleMark("a****b", 3, 3, "bold")).toEqual({ text: "ab", start: 1, end: 1 });
    expect(toggleMark("a****b", 3, 3, "italic")).toEqual({ text: "a**__**b", start: 4, end: 4 });
    expect(toggleMark("a**x**b", 4, 4, "bold")).toEqual({ text: "a**x**b", start: 6, end: 6 });
  });

  it("handles inline code", () => {
    expect(toggleMark("say `hi` now", 5, 7, "bold")).toEqual({
      text: "say `hi` now",
      start: 5,
      end: 7,
    });
    expect(toggleMark("a `b` c", 3, 4, "code")).toEqual({ text: "a b c", start: 2, end: 3 });
    expect(toggleMark("use a`b here", 4, 7, "code").text).toBe("use ``a`b`` here");
  });
});

describe("formatsAt", () => {
  it("reports the styles and link around a selection", () => {
    const formats = formatsAt("**_x_** [y](https://e.com) `z`", 3, 4);
    expect([...formats.marks].sort()).toEqual(["bold", "italic"]);
    expect(formats.link).toBeNull();
    expect(formatsAt("**_x_** [y](https://e.com) `z`", 9, 10).link?.href).toBe("https://e.com");
    expect(formatsAt("**_x_** [y](https://e.com) `z`", 28, 29).inCode).toBe(true);
  });
});

describe("links", () => {
  it("links a selection, changes the address, and removes the link", () => {
    const linked = setLink("_bold_", 1, 5, "https://example.com");
    expect(linked).toEqual({ text: "_[bold](https://example.com)_", start: 2, end: 6 });
    expect(setLink(linked.text, 2, 6, "https://other.org").text).toBe(
      "_[bold](https://other.org)_",
    );
    expect(removeLink(linked.text, 2, 6)).toEqual({ text: "_bold_", start: 1, end: 5 });
  });

  it("puts addresses with spaces in angle brackets and ignores a bare caret", () => {
    expect(setLink("x", 0, 1, "a b").text).toBe("[x](<a b>)");
    expect(setLink("x y", 1, 1, "https://e.com")).toEqual({ text: "x y", start: 1, end: 1 });
  });

  it("keeps bare URLs, which cannot be unlinked", () => {
    expect(removeLink("see https://e.com", 6, 8).text).toBe("see https://e.com");
  });
});

describe("linkHref", () => {
  it("completes web and mail addresses and keeps the rest", () => {
    expect(linkHref(" example.com/a ")).toBe("https://example.com/a");
    expect(linkHref("me@site.org")).toBe("mailto:me@site.org");
    expect(linkHref("https://x.org")).toBe("https://x.org");
    expect(linkHref("../Other/README.md")).toBe("../Other/README.md");
    expect(linkHref("Trips/README.md")).toBe("Trips/README.md");
    expect(linkHref("   ")).toBeNull();
  });
});
