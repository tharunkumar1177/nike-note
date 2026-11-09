/**
 * Inline formatting of one block's text: turning bold, italic, strikethrough,
 * code, inline equations, and links on and off for a selection by adding or
 * removing Markdown delimiters. Every function returns the new text and where
 * the selection belongs in it, so the selected words stay selected.
 */
import { scanInline, type InlineSpan, type SourceRange } from "./inline";

/** A text style the formatting toolbar toggles. `math` is an inline equation. */
export type Mark = "bold" | "italic" | "strike" | "code" | "math";

/** Marks whose content is taken literally, where no other style applies. */
const LITERAL: readonly Mark[] = ["code", "math"];

/** Text with a selection from `start` to `end` (equal for a caret). */
export interface Selected {
  text: string;
  start: number;
  end: number;
}

/** A link around a selection. */
export interface LinkRange extends SourceRange {
  href: string;
  /** True for `[label](href)`; `<url>` and bare URLs cannot be unlinked. */
  bracketed: boolean;
}

/** The styles and link around a selection, for toolbar buttons. */
export interface Formats {
  marks: ReadonlySet<Mark>;
  link: LinkRange | null;
  /** True inside inline code or an inline equation, where other styles do not apply. */
  inCode: boolean;
}

/** Every node of `spans` and their descendants, each parent before its children. */
function flatten(spans: readonly InlineSpan[]): InlineSpan[] {
  return spans.flatMap((span) => [span, ...("children" in span ? flatten(span.children) : [])]);
}

/** The formatted (non-text) nodes of `text`, outermost first. */
function styledSpans(text: string): InlineSpan[] {
  return flatten(scanInline(text)).filter((span) => span.type !== "text");
}

/**
 * The selection a command acts on: surrounding spaces are left out, a
 * selection that starts or ends inside a delimiter takes the whole delimiter,
 * and a selection of a whole styled span becomes its content.
 */
function narrow(text: string, start: number, end: number): Selected {
  let from = Math.max(0, Math.min(start, end));
  let to = Math.min(text.length, Math.max(start, end));
  if (from < to) {
    while (from < to && /\s/.test(text[from] ?? "")) from += 1;
    while (to > from && /\s/.test(text[to - 1] ?? "")) to -= 1;
    if (from === to) return { text, start: Math.min(start, end), end: Math.min(start, end) };
  }
  for (const span of styledSpans(text)) {
    if (from > span.from && from < span.innerFrom) from = span.from;
    if (to > span.innerTo && to < span.to) to = span.to;
    if (from === span.from && to === span.to && from < to) {
      from = span.innerFrom;
      to = span.innerTo;
    }
  }
  return { text, start: from, end: to };
}

/**
 * Grow a selection until it no longer cuts through a styled span, so the
 * delimiters added around it nest correctly.
 */
function widen(text: string, start: number, end: number): Selected {
  let from = start;
  let to = end;
  const spans = styledSpans(text);
  for (let changed = true; changed; ) {
    changed = false;
    for (const span of spans) {
      const inside = (at: number): boolean => at > span.from && at < span.to;
      const within = from >= span.innerFrom && to <= span.innerTo;
      if (within) continue;
      if (inside(from) && to >= span.to) {
        from = span.from;
        changed = true;
      }
      if (inside(to) && from <= span.from) {
        to = span.to;
        changed = true;
      }
    }
  }
  return { text, start: from, end: to };
}

/** The innermost span of `type` whose content holds the selection, or null. */
function enclosing(
  text: string,
  start: number,
  end: number,
  type: InlineSpan["type"],
): InlineSpan | null {
  const holding = styledSpans(text).filter(
    (span) => span.type === type && span.innerFrom <= start && end <= span.innerTo,
  );
  return holding.at(-1) ?? null;
}

/** The styles and link around the selection from `start` to `end` in `text`. */
export function formatsAt(text: string, start: number, end: number): Formats {
  const selection = narrow(text, start, end);
  const marks = new Set<Mark>();
  for (const mark of ["bold", "italic", "strike", "code", "math"] as const) {
    if (enclosing(text, selection.start, selection.end, mark)) marks.add(mark);
  }
  return {
    marks,
    link: linkAt(text, start, end),
    inCode: LITERAL.some((mark) => marks.has(mark)),
  };
}

/** True when an asterisk touches the selection, so `_` delimiters nest more safely. */
function touchesAsterisk(text: string, start: number, end: number): boolean {
  return [text[start - 1], text[start], text[end - 1], text[end]].includes("*");
}

/** Length of the run of `char` ending just before `at` (`step` -1) or starting at `at` (1). */
function runAt(text: string, at: number, step: 1 | -1, char: string): number {
  let length = 0;
  while (text[step < 0 ? at - 1 - length : at + length] === char) length += 1;
  return length;
}

/**
 * The empty delimiter pair for `mark` around a caret (`****` with the caret
 * in the middle), which Markdown does not read as styled text, or null.
 */
function emptyPair(text: string, caret: number, mark: Mark): { from: number; to: number } | null {
  const chars = { bold: ["*", "_"], italic: ["*", "_"], strike: ["~"], code: ["`"], math: ["$"] }[
    mark
  ];
  for (const char of chars) {
    const before = runAt(text, caret, -1, char);
    if (before === 0 || runAt(text, caret, 1, char) !== before) continue;
    const width = {
      bold: before === 2 || before === 3 ? 2 : 0,
      italic: before === 1 || before === 3 ? 1 : 0,
      strike: before === 2 ? 2 : 0,
      code: before,
      math: before === 1 ? 1 : 0,
    }[mark];
    if (width > 0) return { from: caret - width, to: caret + width };
  }
  return null;
}

/** The delimiter that adds `mark` around the selection. */
function delimiterFor(
  mark: Exclude<Mark, "code" | "math">,
  text: string,
  start: number,
  end: number,
): string {
  const underscore = touchesAsterisk(text, start, end);
  if (mark === "bold") return underscore ? "__" : "**";
  if (mark === "italic") return underscore ? "_" : "*";
  return "~~";
}

/** Inline code around `content`, with a fence longer than any backtick run inside it. */
function codeSpan(content: string): { open: string; close: string } {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = content.startsWith("`") || content.endsWith("`") ? " " : "";
  return { open: fence + pad, close: pad + fence };
}

/**
 * An inline equation around TeX `content` that is followed by `after`:
 * `$…$`, or `` $`…`$ `` when plain dollars would not read back as the same
 * TeX (a `$` inside, a backtick at its start, a backslash at its end, or a
 * digit after it).
 */
function mathSpan(content: string, after: string | undefined): { open: string; close: string } {
  const plain =
    !content.includes("$") &&
    !content.startsWith("`") &&
    !content.endsWith("\\") &&
    !/\d/.test(after ?? "");
  if (plain) {
    return { open: "$", close: "$" };
  }
  const code = codeSpan(content);
  return { open: `$${code.open}`, close: `${code.close}$` };
}

/** Add `mark` around the selection, or a pair of delimiters at a caret. */
function addMark(selection: Selected, mark: Mark): Selected {
  const { text } = selection;
  const { start, end } =
    selection.start === selection.end ? selection : widen(text, selection.start, selection.end);
  const content = text.slice(start, end);
  let open: string;
  let close: string;
  if (mark === "code") {
    ({ open, close } = start === end ? { open: "`", close: "`" } : codeSpan(content));
  } else if (mark === "math") {
    ({ open, close } = start === end ? { open: "$", close: "$" } : mathSpan(content, text[end]));
  } else {
    open = delimiterFor(mark, text, start, end);
    close = open;
  }
  const inner = start + open.length;
  return {
    text: text.slice(0, start) + open + content + close + text.slice(end),
    start: inner,
    end: inner + content.length,
  };
}

/** Put `piece` back inside `open` and `close`, with its outer spaces left outside. */
function rewrap(piece: string, open: string, close: string): string {
  const core = piece.trim();
  if (core === "") return piece;
  const lead = piece.slice(0, piece.length - piece.trimStart().length);
  const trail = piece.slice(piece.trimEnd().length);
  return lead + open + core + close + trail;
}

/**
 * Take `span`'s style off the selection. Text of the span before and after
 * the selection keeps the style. At a caret, the caret moves past the
 * closing delimiter, so typing goes on unstyled.
 */
function removeMark(selection: Selected, span: InlineSpan): Selected {
  const { text, start, end } = selection;
  if (start === end) {
    return { text, start: span.to, end: span.to };
  }
  let { start: cutFrom, end: cutTo } = widen(text, start, end);
  for (const nested of styledSpans(text)) {
    const inSpan = nested !== span && nested.from >= span.innerFrom && nested.to <= span.innerTo;
    if (inSpan && nested.innerFrom <= start && end <= nested.innerTo) {
      cutFrom = Math.min(cutFrom, nested.from);
      cutTo = Math.max(cutTo, nested.to);
    }
  }
  const intraword = (delimiter: string): string => delimiter.replace(/_/g, "*");
  const open = intraword(text.slice(span.from, span.innerFrom));
  const close = intraword(text.slice(span.innerTo, span.to));
  const before = rewrap(text.slice(span.innerFrom, cutFrom), open, close);
  const middle = text.slice(cutFrom, cutTo);
  const after = rewrap(text.slice(cutTo, span.innerTo), open, close);
  const from = span.from + before.length + (start - cutFrom);
  return {
    text: text.slice(0, span.from) + before + middle + after + text.slice(span.to),
    start: from,
    end: from + (end - start),
  };
}

/**
 * Turn `mark` on or off for the selection from `start` to `end` in `text`.
 * Inside inline code only code itself can be turned off.
 */
export function toggleMark(text: string, start: number, end: number, mark: Mark): Selected {
  const selection = narrow(text, start, end);
  if (selection.start === selection.end) {
    const pair = emptyPair(text, selection.start, mark);
    if (pair) {
      const rest = text.slice(0, pair.from) + text.slice(pair.to);
      return { text: rest, start: pair.from, end: pair.from };
    }
  }
  const span = enclosing(text, selection.start, selection.end, mark);
  if (span && mark === "math") return unwrapMath(text, span);
  if (span) return removeMark(selection, span);
  if (LITERAL.some((literal) => enclosing(text, selection.start, selection.end, literal))) {
    return { text, start, end };
  }
  return addMark(selection, mark);
}

/**
 * Turn the whole inline equation `span` back into text, its TeX selected,
 * since part of an equation is not an equation of its own.
 */
function unwrapMath(text: string, span: InlineSpan): Selected {
  const tex = text.slice(span.innerFrom, span.innerTo);
  return {
    text: text.slice(0, span.from) + tex + text.slice(span.to),
    start: span.from,
    end: span.from + tex.length,
  };
}

/** The innermost link around the selection from `start` to `end`, or null. */
export function linkAt(text: string, start: number, end: number): LinkRange | null {
  const selection = narrow(text, start, end);
  const span = enclosing(text, selection.start, selection.end, "link");
  if (!span || span.type !== "link") return null;
  const { from, to, innerFrom, innerTo, href, bracketed } = span;
  return { from, to, innerFrom, innerTo, href, bracketed };
}

/** A link destination for `href`, in angle brackets when it has spaces or unbalanced parentheses. */
function destination(href: string): string {
  let depth = 0;
  for (const char of href) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) break;
  }
  if (depth === 0 && !/[\s<>]/.test(href)) return href;
  return `<${href.replace(/</g, "%3C").replace(/>/g, "%3E")}>`;
}

/**
 * Link the selection from `start` to `end` to `href`, or change the address
 * of the link already around it. A caret outside any link changes nothing.
 */
export function setLink(text: string, start: number, end: number, href: string): Selected {
  const target = destination(href);
  const link = linkAt(text, start, end);
  if (link) {
    const label = text.slice(link.innerFrom, link.innerTo);
    const replacement = `[${label}](${target})`;
    return {
      text: text.slice(0, link.from) + replacement + text.slice(link.to),
      start: link.from + 1,
      end: link.from + 1 + label.length,
    };
  }
  const narrowed = narrow(text, start, end);
  if (narrowed.start === narrowed.end) return { text, start, end };
  const { start: from, end: to } = widen(text, narrowed.start, narrowed.end);
  const label = text.slice(from, to);
  return {
    text: `${text.slice(0, from)}[${label}](${target})${text.slice(to)}`,
    start: from + 1,
    end: from + 1 + label.length,
  };
}

/** Remove the `[label](href)` link around the selection, keeping its label. */
export function removeLink(text: string, start: number, end: number): Selected {
  const link = linkAt(text, start, end);
  if (!link || !link.bracketed) return { text, start, end };
  const label = text.slice(link.innerFrom, link.innerTo);
  return {
    text: text.slice(0, link.from) + label + text.slice(link.to),
    start: link.from,
    end: link.from + label.length,
  };
}

/**
 * The link address for what the user typed: web and mail addresses get their
 * scheme (`example.com` becomes `https://example.com`), and addresses with a
 * scheme or a relative path are kept. Returns null for empty input.
 */
export function linkHref(input: string): string | null {
  const value = input.trim();
  if (value === "") return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || /^(\/|#|\.\.?\/)/.test(value)) return value;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value)) return `mailto:${value}`;
  if (/^[^\s/]+\.[a-z]{2,}(?:[/?#:]|$)/i.test(value)) return `https://${value}`;
  return value;
}
