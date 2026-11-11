/**
 * Sub-page link lines and page-relative link resolution. The link-line rule
 * matches the helper's page tree rule in architecture.md#page-structure.
 */

/** File name of a page body. */
export const README = "README.md";

/** A whole-line sub-page link: `[Title](folder/README.md)`. */
export interface PageLinkLine {
  title: string;
  folder: string;
}

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
 * Parse a line that consists only of a link to a direct child page.
 */
export function parsePageLinkLine(line: string): PageLinkLine | null {
  const text = line.trim();
  if (!text.startsWith("[") || !text.endsWith(")")) return null;
  const split = text.lastIndexOf("](");
  if (split < 1) return null;
  let target = text.slice(split + 2, -1);
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
  if (target.startsWith("./")) target = target.slice(2);
  const suffix = `/${README}`;
  if (!target.endsWith(suffix)) return null;
  const folder = decode(target.slice(0, -suffix.length));
  if (
    folder === null ||
    folder === "" ||
    folder.includes("/") ||
    folder.includes("\\") ||
    folder.startsWith(".") ||
    folder === "assets"
  ) {
    return null;
  }
  return { title: text.slice(1, split), folder };
}

/**
 * The link line for direct child page `folder` titled `title`, in the form
 * {@link parsePageLinkLine} reads back. Brackets leave the title and the
 * folder is percent-encoded, parentheses included, so the line stays one link.
 */
export function pageLinkLine(title: string, folder: string): string {
  const label =
    title
      .replace(/[[\]\r\n]+/g, " ")
      .replace(/ {2,}/g, " ")
      .trim() || folder;
  const target = encodeURIComponent(folder).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `[${label}](${target}/${README})`;
}

/**
 * The image line for file `name` in the page's `assets` folder. The alt text
 * is the name without its extension, brackets removed, and the file name is
 * percent-encoded, parentheses included, so the line stays one image.
 */
export function assetImageLine(name: string): string {
  const alt = name
    .replace(/\.[^.]*$/, "")
    .replace(/[[\]\r\n]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  const target = encodeURIComponent(name).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `![${alt}](assets/${target})`;
}

/**
 * True for links that leave Quire: web and mail addresses.
 */
export function isExternalHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

/**
 * The file a relative link from page `pagePath` points at, as a `/`-separated
 * path in the notes folder, or null for web, absolute, fragment-only, and
 * malformed links and links that leave the notes folder. `#` and `?` suffixes
 * are dropped and `%XX` escapes decoded.
 */
export function resolveFileHref(pagePath: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || /^[/\\#?]/.test(href)) return null;
  const withoutSuffix = href.split(/[#?]/)[0] ?? "";
  const target = withoutSuffix.startsWith("<") ? withoutSuffix.slice(1, -1) : withoutSuffix;
  const decoded = decode(target);
  if (decoded === null || decoded.includes("\\")) return null;

  const resolved = pagePath === "" ? [] : pagePath.split("/");
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) return null;
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  return resolved.length === 0 ? null : resolved.join("/");
}

/**
 * The page path a relative link from `pagePath` points at, or null when it is
 * not a link to a page's README.md inside the notes folder.
 */
export function resolvePageHref(pagePath: string, href: string): string | null {
  const file = resolveFileHref(pagePath, href);
  if (file === null || (file !== README && !file.endsWith(`/${README}`))) return null;
  return file.slice(0, Math.max(file.length - README.length - 1, 0));
}
