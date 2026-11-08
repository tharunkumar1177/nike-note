/**
 * Unit tests for image lines: reading the Markdown and HTML forms, writing
 * the right form back, and resizing or aligning an image block in a page.
 */
import { describe, expect, it } from "vitest";

import { parseDocument } from "../src/blocks";
import { setImage } from "../src/edit";
import { imageLine, parseImageLine, type ImageParts } from "../src/image";

/** An image with defaults for the parts a test does not care about. */
function image(parts: Partial<ImageParts>): ImageParts {
  return { alt: "", src: "assets/a.png", title: "", width: null, align: "left", ...parts };
}

describe("parseImageLine", () => {
  it("reads a sized and aligned HTML image", () => {
    expect(
      parseImageLine('<p align="center"><img src="assets/map.png" alt="Map" width="320"></p>'),
    ).toEqual(image({ alt: "Map", src: "assets/map.png", width: 320, align: "center" }));
    expect(parseImageLine("<img src='assets/a.png' title=\"Day &amp; night\" />")).toEqual(
      image({ title: "Day & night" }),
    );
    expect(parseImageLine('<P ALIGN="Right"><IMG SRC="a.png"></P>')).toEqual(
      image({ src: "a.png", align: "right" }),
    );
  });

  it("leaves HTML it cannot rewrite faithfully as text", () => {
    expect(parseImageLine('<img src="a.png" height="20">')).toBeNull();
    expect(parseImageLine('<img src="a.png" width="50%">')).toBeNull();
    expect(parseImageLine('<img src="a.png" width="0">')).toBeNull();
    expect(parseImageLine('<img alt="no source">')).toBeNull();
    expect(parseImageLine('<img src="a.png" src="b.png">')).toBeNull();
    expect(parseImageLine('<p align="center"><img src="a.png">')).toBeNull();
    expect(parseImageLine('<img src="a.png"></p>')).toBeNull();
    expect(parseImageLine('<p align="justify"><img src="a.png"></p>')).toBeNull();
    expect(parseImageLine('<img src="a.png"> after')).toBeNull();
  });
});

describe("imageLine", () => {
  it("writes Markdown for an image at its own size on the left", () => {
    expect(imageLine(image({ alt: "a [b]", title: 'say "hi"' }))).toBe(
      '![a \\[b\\]](assets/a.png "say \\"hi\\"")',
    );
    expect(imageLine(image({ src: "assets/f(1) x.png" }))).toBe("![](<assets/f(1) x.png>)");
  });

  it("writes HTML once an image has a width or an alignment", () => {
    expect(imageLine(image({ alt: 'A "big" <map>', width: 320.6, align: "left" }))).toBe(
      '<p align="left"><img src="assets/a.png" alt="A &quot;big&quot; &lt;map&gt;" width="321"></p>',
    );
    expect(imageLine(image({ title: "T", align: "right" }))).toBe(
      '<p align="right"><img src="assets/a.png" alt="" title="T"></p>',
    );
  });

  it("reads back what it writes", () => {
    const samples = [
      image({ alt: "a ] \\ b", src: "assets/a b(1).png", title: 'x "y"' }),
      image({ alt: "a & b", src: "assets/R&D.png", title: "<t>", width: 48, align: "center" }),
      image({ src: "https://example.com/a.png?x=1&y=2", width: 9999, align: "right" }),
    ];
    for (const sample of samples) expect(parseImageLine(imageLine(sample))).toEqual(sample);
  });
});

describe("setImage", () => {
  it("rewrites only the image line and keeps line endings", () => {
    const source = "\uFEFF# Trip\r\n![Map](assets/map.png)\r\n\r\nafter\r\n";
    const document = parseDocument(source);
    expect(setImage(document, 1, { width: 200, align: "center" })).toBe(
      '\uFEFF# Trip\r\n<p align="center"><img src="assets/map.png" alt="Map" width="200"></p>\r\n\r\nafter\r\n',
    );
  });

  it("puts an empty line after HTML when the next line has text", () => {
    const document = parseDocument("![Map](assets/map.png)\nafter\n");
    expect(setImage(document, 0, { align: "right" })).toBe(
      '<p align="right"><img src="assets/map.png" alt="Map"></p>\n\nafter\n',
    );
    expect(setImage(parseDocument("![Map](assets/map.png)"), 0, { width: 10 })).toBe(
      '<p align="left"><img src="assets/map.png" alt="Map" width="10"></p>',
    );
  });

  it("goes back to Markdown at the original size on the left", () => {
    const document = parseDocument('<p align="center"><img src="a.png" alt="A" width="9"></p>\n');
    expect(setImage(document, 0, { width: null, align: "left" })).toBe("![A](a.png)\n");
    expect(setImage(document, 5, { width: 1 })).toBeNull();
    expect(setImage(parseDocument("text\n"), 0, { width: 1 })).toBeNull();
  });
});
