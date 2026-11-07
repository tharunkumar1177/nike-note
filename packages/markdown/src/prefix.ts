/**
 * The Markdown marker at the start of a one-line block (`## `, `- `, `1. `,
 * `- [ ] `, `> `) split from the text after it, so an editor can show the text
 * alone and draw the marker as a bullet, number, checkbox, or heading style.
 * Also the typing shortcuts that turn a plain line into another block type.
 */
import type { HeadingLevel } from "./blocks";

/** Block type a line's marker gives it while it is edited. */
export type LineKind = "text" | "heading" | "bullet" | "numbered" | "todo" | "quote";

/** A line split into its marker and its text. */
export interface LineParts {
  kind: LineKind;
  /** Everything before the text: indentation, marker, and the spaces after it. */
  prefix: string;
  /** The text after the marker. */
  content: string;
  /** Leading indentation of a list item, "" otherwise. */
  indent: string;
  /** Heading level, 0 for other kinds. */
  level: HeadingLevel | 0;
  /** True for a checked to-do. */
  checked: boolean;
}

const DIVIDER = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const TODO = /^([ \t]*)([-*+]) \[([ xX])\][ \t]+/;
const BULLET = /^([ \t]*)([-*+])[ \t]+/;
const NUMBERED = /^([ \t]*)(\d{1,9})([.)])[ \t]+/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+/;
const QUOTE = /^ {0,3}>[ \t]/;
const TODO_SHORTCUT = /^\[([ xX]?)\][ \t]/;
const QUOTE_SHORTCUT = /^"[ \t]/;

/** List kinds, which Tab and Shift+Tab indent and outdent. */
export const LIST_KINDS: ReadonlySet<LineKind> = new Set(["bullet", "numbered", "todo"]);

/**
 * Split one line into its marker and text. A marker counts only when a space
 * follows it, so typing `-5` or `#tag` never flashes a list or a heading.
 */
export function splitLine(line: string): LineParts {
  const parts = (
    kind: LineKind,
    prefix: string,
    extra: Partial<Pick<LineParts, "indent" | "level" | "checked">> = {},
  ): LineParts => ({
    kind,
    prefix,
    content: line.slice(prefix.length),
    indent: extra.indent ?? "",
    level: extra.level ?? 0,
    checked: extra.checked ?? false,
  });
  if (line.includes("\n") || DIVIDER.test(line)) return parts("text", "");
  const todo = TODO.exec(line);
  if (todo) return parts("todo", todo[0], { indent: todo[1], checked: todo[3] !== " " });
  const bullet = BULLET.exec(line);
  if (bullet) return parts("bullet", bullet[0], { indent: bullet[1] });
  const numbered = NUMBERED.exec(line);
  if (numbered) return parts("numbered", numbered[0], { indent: numbered[1] });
  const heading = HEADING.exec(line);
  if (heading) {
    return parts("heading", heading[0], { level: (heading[1] ?? "#").length as HeadingLevel });
  }
  const quote = QUOTE.exec(line);
  if (quote) return parts("quote", quote[0]);
  return parts("text", "");
}

/**
 * The indentation that nests an item under the list item `parent`: the
 * parent's indentation plus the width of its marker (`- ` or `12. `).
 */
export function nestedIndent(parent: LineParts): string {
  const marker = parent.prefix.slice(parent.indent.length);
  const width = parent.kind === "numbered" ? (/^\d+[.)]/.exec(marker)?.[0].length ?? 2) + 1 : 2;
  return parent.indent + " ".repeat(width);
}

/**
 * A typing shortcut that Markdown does not cover on its own: `[] ` or `[x] `
 * starts a to-do and `" ` starts a quote. Returns the rewritten line when
 * `line` is plain text whose shortcut ends exactly at the caret, or null.
 */
export function applyShortcut(line: string, caret: number): string | null {
  if (splitLine(line).kind !== "text") return null;
  const todo = TODO_SHORTCUT.exec(line);
  if (todo && todo[0].length === caret) {
    const mark = todo[1]?.toLowerCase() === "x" ? "x" : " ";
    return `- [${mark}] ${line.slice(caret)}`;
  }
  const quote = QUOTE_SHORTCUT.exec(line);
  if (quote && quote[0].length === caret) return `> ${line.slice(caret)}`;
  return null;
}
