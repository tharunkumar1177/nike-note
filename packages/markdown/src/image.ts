/**
 * Image lines (architecture.md#block-model-and-line-mapping). An image block
 * is a line that is only a Markdown image, `![alt](src "title")`, or only an
 * HTML image as GitHub sizes and aligns them:
 * `<p align="center"><img src="…" alt="…" width="320"></p>`. An image at its
 * own size on the left is written as Markdown; any other is written as HTML.
 */

/** Where an image sits across the page. */
export type ImageAlign = "left" | "center" | "right";

/** What an image line says. */
export interface ImageParts {
  alt: string;
  src: string;
  title: string;
  /** Shown width in CSS pixels, or null for the image's own size. */
  width: number | null;
  align: ImageAlign;
}

/** Widest image width a line may set, in CSS pixels. */
export const MAX_IMAGE_WIDTH = 9999;

const MARKDOWN_IMAGE =
  /^ {0,3}!\[((?:[^\\\]]|\\.)*)\]\([ \t]*(<[^<>\n]*>|(?:[^\s()\\]|\\.|\((?:[^\s()\\]|\\.)*\))+)(?:[ \t]+"((?:[^"\\]|\\.)*)")?[ \t]*\)[ \t]*$/;
const HTML_IMAGE =
  /^ {0,3}(?:<p[ \t]+align[ \t]*=[ \t]*(?:"([a-z]+)"|'([a-z]+)')[ \t]*>[ \t]*)?<img((?:[ \t]+[a-z-]+[ \t]*=[ \t]*(?:"[^"]*"|'[^']*'))*)[ \t]*\/?>([ \t]*<\/p>)?[ \t]*$/i;
const ATTRIBUTE = /([a-z-]+)[ \t]*=[ \t]*(?:"([^"]*)"|'([^']*)')/gi;
const ALIGNS: readonly string[] = ["left", "center", "right"];
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Remove backslash escapes from a link destination or title. */
function unescape(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

/** Decode the character references in an HTML attribute value. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi, (whole, name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith("#")) {
      const code = lower.startsWith("#x")
        ? Number.parseInt(lower.slice(2), 16)
        : Number.parseInt(lower.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[lower] ?? whole;
  });
}

/** Text for an HTML attribute value in double quotes. */
function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Alt text or a title on one line, since an image line has no line breaks. */
function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
}

/** The image in a line that is only `![alt](src "title")`. */
function parseMarkdownImage(text: string): ImageParts | null {
  const image = MARKDOWN_IMAGE.exec(text);
  if (!image) return null;
  const target = image[2] ?? "";
  const src = target.startsWith("<") ? target.slice(1, -1) : target;
  return {
    alt: unescape(image[1] ?? ""),
    src: unescape(src),
    title: unescape(image[3] ?? ""),
    width: null,
    align: "left",
  };
}

/**
 * The image in a line that is only an `<img>` tag, optionally inside
 * `<p align="…">…</p>`. Only `src` (required), `alt`, `title`, and a whole
 * `width` are understood; any other attribute leaves the line as text.
 */
function parseHtmlImage(text: string): ImageParts | null {
  const image = HTML_IMAGE.exec(text);
  if (!image) return null;
  const align = (image[1] ?? image[2])?.toLowerCase();
  if ((align === undefined) !== (image[4] === undefined)) return null;
  if (align !== undefined && !ALIGNS.includes(align)) return null;
  const values = new Map<string, string>();
  for (const attribute of (image[3] ?? "").matchAll(ATTRIBUTE)) {
    const name = (attribute[1] ?? "").toLowerCase();
    if (values.has(name)) return null;
    values.set(name, decodeEntities(attribute[2] ?? attribute[3] ?? ""));
  }
  const src = values.get("src");
  if (src === undefined || src.trim() === "") return null;
  if ([...values.keys()].some((name) => !["src", "alt", "title", "width"].includes(name))) {
    return null;
  }
  const widthText = values.get("width")?.trim();
  let width: number | null = null;
  if (widthText !== undefined) {
    if (!/^\d{1,4}$/.test(widthText) || Number(widthText) === 0) return null;
    width = Number(widthText);
  }
  return {
    alt: values.get("alt") ?? "",
    src: src.trim(),
    title: values.get("title") ?? "",
    width,
    align: (align ?? "left") as ImageAlign,
  };
}

/** The image a line holds when the whole line is one image, in either form. */
export function parseImageLine(text: string): ImageParts | null {
  return parseMarkdownImage(text) ?? parseHtmlImage(text);
}

/** The Markdown form `![alt](src "title")` of an image. */
function markdownImage(image: ImageParts): string {
  const alt = oneLine(image.alt).replace(/[\\[\]]/g, "\\$&");
  const bare = image.src !== "" && !/[\s<>()\\]/.test(image.src);
  const target = bare
    ? image.src
    : `<${image.src.replace(/\\/g, "\\\\").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/[\r\n]/g, "")}>`;
  const title = oneLine(image.title).replace(/[\\"]/g, "\\$&");
  return `![${alt}](${target}${title === "" ? "" : ` "${title}"`})`;
}

/**
 * The line for an image: Markdown at its own size on the left, otherwise one
 * line of HTML with the width and alignment GitHub honors.
 */
export function imageLine(image: ImageParts): string {
  if (image.width === null && image.align === "left") return markdownImage(image);
  const attributes = [
    `src="${escapeAttribute(oneLine(image.src))}"`,
    `alt="${escapeAttribute(oneLine(image.alt))}"`,
  ];
  if (image.title !== "") attributes.push(`title="${escapeAttribute(oneLine(image.title))}"`);
  if (image.width !== null) {
    const width = Math.min(Math.max(Math.round(image.width), 1), MAX_IMAGE_WIDTH);
    attributes.push(`width="${width}"`);
  }
  return `<p align="${image.align}"><img ${attributes.join(" ")}></p>`;
}
