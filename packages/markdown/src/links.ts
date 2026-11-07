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
 * True for links that leave Quire: web and mail addresses.
 */
export function isExternalHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

/**
 * The page path a relative link from `pagePath` points at, or null when it is
 * not a link to a page's README.md inside the notes folder.
 */
export function resolvePageHref(pagePath: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/") || href.startsWith("#")) {
    return null;
  }
  const withoutFragment = href.split("#")[0] ?? "";
  const target = withoutFragment.startsWith("<") ? withoutFragment.slice(1, -1) : withoutFragment;
  const decoded = decode(target);
  if (decoded === null) return null;
  const segments = decoded.split("/");
  if (segments.pop() !== README) return null;

  const resolved = pagePath === "" ? [] : pagePath.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) return null;
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  return resolved.join("/");
}
