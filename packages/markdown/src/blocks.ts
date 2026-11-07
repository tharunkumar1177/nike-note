/**
 * Block model and line-based block parser (architecture.md#block-model-and-line-mapping).
 * One source line is one block, except front matter, fenced code, and tables,
 * which are one block each. Every block keeps its exact source in `raw`, so
 * joining the blocks' `raw` reproduces the document unchanged.
 */
import { parsePageLinkLine } from "./links";
import { dominantEol, indentWidth, splitLines, type SourceLine } from "./lines";

/** Heading levels `#` to `######`. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Deepest list nesting shown; deeper items are shown at this depth. */
export const MAX_LIST_DEPTH = 8;

/** The parts every block shares. */
interface BlockBase {
  /** Exact source of the block, including its line endings. */
  raw: string;
  /** Zero-based index of the block's first source line. */
  line: number;
}

/** A parsed block. Text fields hold inline Markdown without the block marker. */
export type Block = BlockBase &
  (
    | { type: "text"; text: string }
    | { type: "heading"; level: HeadingLevel; text: string }
    | { type: "quote"; text: string }
    | { type: "bullet"; depth: number; text: string }
    | { type: "numbered"; depth: number; number: number; text: string }
    | { type: "todo"; depth: number; checked: boolean; text: string }
    | { type: "divider" }
    | { type: "code"; language: string; code: string; closed: boolean }
    | { type: "page"; title: string; folder: string }
    | { type: "frontMatter"; yaml: string }
    | { type: "table"; source: string }
  );

/** A whole document: its blocks, its byte-order mark, and its dominant line ending. */
export interface MarkdownDocument {
  bom: boolean;
  eol: "\n" | "\r\n";
  blocks: Block[];
}

/** `Omit` applied to each member of a union separately. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A single-line block before its source position is attached. */
type LineBlock = DistributiveOmit<
  Exclude<Block, { type: "code" | "frontMatter" | "table" }>,
  "raw" | "line"
>;

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const TODO = /^([ \t]*)[-*+] \[([ xX])\](?:[ \t]+(.*))?$/;
const BULLET = /^([ \t]*)[-*+](?:[ \t]+(.*))?$/;
const NUMBERED = /^([ \t]*)(\d{1,9})[.)](?:[ \t]+(.*))?$/;
const DIVIDER = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/**
 * Join lines back into source text, endings included.
 */
function rawOf(lines: readonly SourceLine[]): string {
  return lines.map((line) => line.text + line.eol).join("");
}

/**
 * True when a line closes a fence opened with `marker`.
 */
function closesFence(text: string, marker: string): boolean {
  const trimmed = text.replace(/^ {0,3}/, "");
  const char = marker[0] ?? "`";
  let run = 0;
  while (trimmed[run] === char) run += 1;
  return run >= marker.length && trimmed.slice(run).trim() === "";
}

/**
 * True when a line is a table delimiter row with at least one pipe on it or its header.
 */
function startsTable(header: string, delimiter: string | undefined): boolean {
  if (delimiter === undefined || !TABLE_DELIMITER.test(delimiter)) return false;
  return header.includes("|") && (delimiter.includes("|") || header.trim().startsWith("|"));
}

/**
 * Tracks list indentation so nesting works for both two- and four-space styles.
 */
class ListDepth {
  private stack: number[] = [];

  /**
   * Depth for a list item indented by `width` columns.
   */
  depthFor(width: number): number {
    while (this.stack.length > 0 && width < (this.stack.at(-1) ?? 0)) this.stack.pop();
    if (this.stack.length === 0 || width > (this.stack.at(-1) ?? 0)) this.stack.push(width);
    return Math.min(this.stack.length - 1, MAX_LIST_DEPTH);
  }

  /** Forget the indentation after a non-list block. */
  reset(): void {
    this.stack = [];
  }
}

/**
 * Classify one line that is not part of a multi-line block.
 */
function parseLine(text: string, lists: ListDepth): LineBlock {
  if (DIVIDER.test(text)) {
    lists.reset();
    return { type: "divider" };
  }
  const todo = TODO.exec(text);
  if (todo) {
    return {
      type: "todo",
      depth: lists.depthFor(indentWidth(todo[1] ?? "")),
      checked: todo[2] !== " ",
      text: todo[3] ?? "",
    };
  }
  const bullet = BULLET.exec(text);
  if (bullet) {
    return {
      type: "bullet",
      depth: lists.depthFor(indentWidth(bullet[1] ?? "")),
      text: bullet[2] ?? "",
    };
  }
  const numbered = NUMBERED.exec(text);
  if (numbered) {
    return {
      type: "numbered",
      depth: lists.depthFor(indentWidth(numbered[1] ?? "")),
      number: Number(numbered[2]),
      text: numbered[3] ?? "",
    };
  }
  if (text.trim() !== "") lists.reset();

  const heading = HEADING.exec(text);
  if (heading) {
    return {
      type: "heading",
      level: (heading[1] ?? "#").length as HeadingLevel,
      text: heading[2] ?? "",
    };
  }
  const quote = QUOTE.exec(text);
  if (quote) return { type: "quote", text: quote[1] ?? "" };
  const page = parsePageLinkLine(text);
  if (page) return { type: "page", ...page };
  return { type: "text", text };
}

/**
 * Parse Markdown source into blocks.
 */
export function parseDocument(source: string): MarkdownDocument {
  const bom = source.startsWith("\uFEFF");
  const lines = splitLines(bom ? source.slice(1) : source);
  const blocks: Block[] = [];
  const lists = new ListDepth();
  let index = 0;

  if (lines[0]?.text.trimEnd() === "---") {
    const close = lines.findIndex(
      (line, at) => at > 0 && (line.text.trimEnd() === "---" || line.text.trimEnd() === "..."),
    );
    if (close > 0) {
      blocks.push({
        type: "frontMatter",
        yaml: lines
          .slice(1, close)
          .map((line) => line.text)
          .join("\n"),
        raw: rawOf(lines.slice(0, close + 1)),
        line: 0,
      });
      index = close + 1;
    }
  }

  while (index < lines.length) {
    const start = index;
    const line = lines[index];
    if (!line) break;

    const fence = FENCE.exec(line.text);
    const marker = fence?.[1];
    if (fence && marker && !(marker.startsWith("`") && (fence[2] ?? "").includes("`"))) {
      let end = index + 1;
      while (end < lines.length && !closesFence(lines[end]?.text ?? "", marker)) end += 1;
      const closed = end < lines.length;
      blocks.push({
        type: "code",
        language: (fence[2] ?? "").trim().split(/\s+/)[0] ?? "",
        code: lines
          .slice(start + 1, end)
          .map((codeLine) => codeLine.text)
          .join("\n"),
        closed,
        raw: rawOf(lines.slice(start, closed ? end + 1 : end)),
        line: start,
      });
      lists.reset();
      index = closed ? end + 1 : end;
      continue;
    }

    if (startsTable(line.text, lines[index + 1]?.text)) {
      let end = index + 2;
      while (end < lines.length) {
        const row = lines[end]?.text ?? "";
        if (row.trim() === "" || !row.includes("|")) break;
        end += 1;
      }
      const tableLines = lines.slice(start, end);
      blocks.push({
        type: "table",
        source: tableLines.map((tableLine) => tableLine.text).join("\n"),
        raw: rawOf(tableLines),
        line: start,
      });
      lists.reset();
      index = end;
      continue;
    }

    blocks.push({ ...parseLine(line.text, lists), raw: rawOf([line]), line: start } as Block);
    index += 1;
  }

  return { bom, eol: dominantEol(lines), blocks };
}

/**
 * Put a document back together. An unedited document comes back byte for byte.
 */
export function serializeDocument(document: MarkdownDocument): string {
  return (document.bom ? "\uFEFF" : "") + document.blocks.map((block) => block.raw).join("");
}

/**
 * Display numbers for numbered items, keyed by block index. A run continues from
 * its first item's number; blank lines and deeper items do not break it, while
 * other blocks, or a bullet at the same depth, start a new run.
 */
export function listNumbers(blocks: readonly Block[]): Map<number, number> {
  const numbers = new Map<number, number>();
  const counters: (number | undefined)[] = [];
  blocks.forEach((block, index) => {
    if (block.type === "numbered") {
      const previous = counters[block.depth];
      const value = previous === undefined ? block.number : previous + 1;
      counters[block.depth] = value;
      counters.length = block.depth + 1;
      numbers.set(index, value);
    } else if (block.type === "bullet" || block.type === "todo") {
      counters[block.depth] = undefined;
      counters.length = block.depth + 1;
    } else if (!(block.type === "text" && block.text.trim() === "")) {
      counters.length = 0;
    }
  });
  return numbers;
}

/**
 * The block that supplies the page title: the first `# ` heading, as in the page tree rule.
 */
export function titleBlockIndex(blocks: readonly Block[]): number {
  return blocks.findIndex(
    (block) =>
      block.type === "heading" && block.level === 1 && block.raw.startsWith("# ") && block.text !== "",
  );
}
