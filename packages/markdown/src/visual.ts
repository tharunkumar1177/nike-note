/**
 * Visual lines (architecture.md#visual-blocks): a line that is only a link
 * to an HTML file in the page's `assets` folder, `[Title](assets/name.html)`,
 * is a Visual block that the app shows as a live, sandboxed page. On GitHub
 * the same line is an ordinary link to the file.
 */

/** The parts of a Visual line. */
export interface VisualParts {
  /** The link text, shown as the block's title. */
  title: string;
  /** The link target as written, without angle brackets, relative to the page folder. */
  src: string;
}

/** The folder inside a page that holds its visuals, as it does its images. */
const ASSETS = "assets/";
/** File extensions a visual can have. */
const HTML_FILE = /\.html?$/i;

/**
 * Decode `%XX` escapes, or return null when the text is malformed.
 */
function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Parse a line that consists only of a link to an `.html` or `.htm` file
 * directly inside the page's `assets` folder. The target may be wrapped in
 * angle brackets (the only place it may hold spaces), start with `./`, and be
 * percent-encoded; the title may not hold brackets, so a line with several
 * links never matches.
 */
export function parseVisualLine(line: string): VisualParts | null {
  const text = line.trim();
  if (!text.startsWith("[") || !text.endsWith(")")) return null;
  const split = text.indexOf("](");
  if (split < 0) return null;
  const title = text.slice(1, split);
  if (/[[\]]/.test(title)) return null;
  let src = text.slice(split + 2, -1);
  if (src.startsWith("<") && src.endsWith(">")) src = src.slice(1, -1);
  else if (/\s/.test(src)) return null;
  const relative = src.startsWith("./") ? src.slice(2) : src;
  if (!relative.startsWith(ASSETS)) return null;
  const name = decode(relative.slice(ASSETS.length));
  if (
    name === null ||
    name === "" ||
    name.startsWith(".") ||
    /[/\\]/.test(name) ||
    name.includes("\u0000") ||
    !HTML_FILE.test(name)
  ) {
    return null;
  }
  return { title, src };
}

/**
 * The Visual line for file `name` in the page's `assets` folder, titled
 * `title` (the file name without its extension when empty). Brackets and
 * line breaks leave the title, and the file name is percent-encoded,
 * parentheses included, so the line stays one link.
 */
export function visualLine(title: string, name: string): string {
  const label =
    title
      .replace(/[[\]\r\n]+/g, " ")
      .replace(/ {2,}/g, " ")
      .trim() || name.replace(HTML_FILE, "");
  const target = encodeURIComponent(name).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `[${label}](${ASSETS}${target})`;
}
