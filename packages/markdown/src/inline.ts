/**
 * Inline Markdown inside a block: bold, italic, strikethrough, code, links,
 * and autolinks. Anything else, including images and HTML, stays plain text.
 */

/** One inline node. */
export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "bold" | "italic" | "strike"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

/** Where an inline node sits in its source: the whole node and its content. */
export interface SourceRange {
  /** Start of the node, including its opening delimiter. */
  from: number;
  /** End of the node, including its closing delimiter. */
  to: number;
  /** Start of the content inside the delimiters. */
  innerFrom: number;
  /** End of the content inside the delimiters. */
  innerTo: number;
}

/** An inline node with the source range it was read from. */
export type InlineSpan = SourceRange &
  (
    | { type: "text"; text: string }
    | { type: "code"; text: string }
    | { type: "bold" | "italic" | "strike"; children: InlineSpan[] }
    | {
        type: "link";
        href: string;
        children: InlineSpan[];
        /** True for `[label](href)`, false for `<url>` and bare URLs. */
        bracketed: boolean;
      }
  );

/** Characters that a backslash escapes. */
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/** Deepest nesting of emphasis and links before the rest is kept as text. */
const MAX_NESTING = 16;

/**
 * True for letters and digits in any script.
 */
function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

/**
 * Find the index of the backtick run that closes a code span opened by `length` backticks.
 */
function findCodeClose(source: string, from: number, length: number): number {
  let index = from;
  while (index < source.length) {
    const next = source.indexOf("`", index);
    if (next === -1) return -1;
    let run = 0;
    while (source[next + run] === "`") run += 1;
    if (run === length) return next;
    index = next + run;
  }
  return -1;
}

/**
 * Find the `]` matching the `[` at `open`, skipping escapes and nested brackets.
 */
function findBracketClose(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") index += 1;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Read a link destination starting after `(`. Returns the href and the index after `)`.
 */
function readDestination(source: string, from: number): { href: string; end: number } | null {
  if (source[from] === "<") {
    const close = source.indexOf(">", from);
    if (close === -1 || source[close + 1] !== ")") return null;
    return { href: source.slice(from + 1, close), end: close + 2 };
  }
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") index += 1;
    else if (char === "(") depth += 1;
    else if (char === ")") {
      if (depth === 0) {
        const inside = source.slice(from, index).trim();
        const href = inside.replace(/\s+"[^"]*"$/, "");
        return /\s/.test(href) ? null : { href, end: index + 1 };
      }
      depth -= 1;
    }
  }
  return null;
}

/**
 * Find a closing emphasis delimiter that is not preceded by whitespace.
 */
function findDelimiterClose(source: string, from: number, delimiter: string): number {
  let index = from;
  while (index < source.length) {
    const found = source.indexOf(delimiter, index);
    if (found === -1) return -1;
    const before = source[found - 1];
    const after = source[found + delimiter.length];
    const intraword = delimiter.startsWith("_") && isWordChar(after);
    const doubled = delimiter.length === 1 && after === delimiter;
    if (found > from && before !== " " && before !== "\t" && before !== "\\" && !intraword && !doubled) {
      return found;
    }
    index = found + (doubled ? 2 : 1);
  }
  return -1;
}

/**
 * Length of a bare `http(s)://` URL at `start`, without trailing punctuation.
 */
function bareUrlLength(source: string, start: number): number {
  const match = /^https?:\/\/[^\s<>]+/i.exec(source.slice(start));
  if (!match) return 0;
  let url = match[0];
  while (/[.,:;!?'"*_~]$/.test(url) || (url.endsWith(")") && !url.includes("("))) {
    url = url.slice(0, -1);
  }
  return url.length;
}

/**
 * Parse inline Markdown into nodes that keep their source ranges, offset by
 * `base` (the position of `source` in the text it was cut from).
 */
export function scanInline(source: string, base = 0, nesting = 0): InlineSpan[] {
  const end = base + source.length;
  if (nesting > MAX_NESTING) {
    return source === ""
      ? []
      : [{ type: "text", text: source, from: base, to: end, innerFrom: base, innerTo: end }];
  }
  const nodes: InlineSpan[] = [];
  let text = "";
  let textFrom = 0;

  /** Add plain text read from `from` up to `to` to the pending text node. */
  const addText = (value: string, from: number): void => {
    if (text === "") textFrom = from;
    text += value;
  };

  /** Move pending plain text, which ends at `to`, into the node list. */
  const flush = (to: number): void => {
    if (text !== "") {
      const from = base + textFrom;
      nodes.push({ type: "text", text, from, to: base + to, innerFrom: from, innerTo: base + to });
    }
    text = "";
  };

  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1];

    if (char === "\\" && next !== undefined && ESCAPABLE.test(next)) {
      addText(next, index);
      index += 2;
      continue;
    }

    if (char === "`") {
      let run = 0;
      while (source[index + run] === "`") run += 1;
      const close = findCodeClose(source, index + run, run);
      if (close === -1) {
        addText("`".repeat(run), index);
        index += run;
        continue;
      }
      let code = source.slice(index + run, close);
      if (code.length > 1 && code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") {
        code = code.slice(1, -1);
      }
      flush(index);
      nodes.push({
        type: "code",
        text: code,
        from: base + index,
        to: base + close + run,
        innerFrom: base + index + run,
        innerTo: base + close,
      });
      index = close + run;
      continue;
    }

    if (char === "!" && next === "[") {
      const close = findBracketClose(source, index + 1);
      const destination =
        close !== -1 && source[close + 1] === "(" ? readDestination(source, close + 2) : null;
      if (destination) {
        addText(source.slice(index, destination.end), index);
        index = destination.end;
        continue;
      }
    }

    if (char === "[") {
      const close = findBracketClose(source, index);
      const destination =
        close !== -1 && source[close + 1] === "(" ? readDestination(source, close + 2) : null;
      if (destination) {
        flush(index);
        nodes.push({
          type: "link",
          href: destination.href,
          children: scanInline(source.slice(index + 1, close), base + index + 1, nesting + 1),
          bracketed: true,
          from: base + index,
          to: base + destination.end,
          innerFrom: base + index + 1,
          innerTo: base + close,
        });
        index = destination.end;
        continue;
      }
    }

    if (char === "<") {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(source.slice(index));
      if (auto?.[1]) {
        const url = auto[1];
        const from = base + index + 1;
        const to = from + url.length;
        flush(index);
        nodes.push({
          type: "link",
          href: url,
          children: [{ type: "text", text: url, from, to, innerFrom: from, innerTo: to }],
          bracketed: false,
          from: base + index,
          to: base + index + auto[0].length,
          innerFrom: from,
          innerTo: to,
        });
        index += auto[0].length;
        continue;
      }
    }

    if ((char === "h" || char === "H") && !isWordChar(source[index - 1])) {
      const length = bareUrlLength(source, index);
      if (length > 0) {
        const url = source.slice(index, index + length);
        const from = base + index;
        const to = from + length;
        flush(index);
        nodes.push({
          type: "link",
          href: url,
          children: [{ type: "text", text: url, from, to, innerFrom: from, innerTo: to }],
          bracketed: false,
          from,
          to,
          innerFrom: from,
          innerTo: to,
        });
        index += length;
        continue;
      }
    }

    if (char === "*" || char === "_" || char === "~") {
      const double = next === char;
      const delimiter = double ? char + char : char;
      const opensWord = char !== "_" || !isWordChar(source[index - 1]);
      const followedBySpace = /\s/.test(source[index + delimiter.length] ?? " ");
      if ((char !== "~" || double) && opensWord && !followedBySpace) {
        const inner = index + delimiter.length;
        const close = findDelimiterClose(source, inner, delimiter);
        if (close !== -1) {
          flush(index);
          nodes.push({
            type: char === "~" ? "strike" : double ? "bold" : "italic",
            children: scanInline(source.slice(inner, close), base + inner, nesting + 1),
            from: base + index,
            to: base + close + delimiter.length,
            innerFrom: base + inner,
            innerTo: base + close,
          });
          index = close + delimiter.length;
          continue;
        }
      }
      addText(delimiter, index);
      index += delimiter.length;
      continue;
    }

    addText(char, index);
    index += 1;
  }
  flush(index);
  return nodes;
}

/** Drop the source ranges from a scanned node. */
function withoutRange(span: InlineSpan): Inline {
  switch (span.type) {
    case "text":
    case "code":
      return { type: span.type, text: span.text };
    case "link":
      return { type: "link", href: span.href, children: span.children.map(withoutRange) };
    default:
      return { type: span.type, children: span.children.map(withoutRange) };
  }
}

/**
 * Parse inline Markdown into nodes.
 */
export function parseInline(source: string): Inline[] {
  return scanInline(source).map(withoutRange);
}

/**
 * The plain text of inline nodes, for titles and accessible names.
 */
export function inlineText(nodes: readonly Inline[]): string {
  return nodes
    .map((node) => (node.type === "text" || node.type === "code" ? node.text : inlineText(node.children)))
    .join("");
}
