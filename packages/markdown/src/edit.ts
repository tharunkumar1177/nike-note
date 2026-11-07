/**
 * Source edits on a parsed document (architecture.md#block-model-and-line-mapping).
 * Every edit rewrites only the lines it touches and returns new source text;
 * all other blocks keep their exact `raw`, line endings included.
 */
import { parseDocument, titleBlockIndex, type Block, type MarkdownDocument } from "./blocks";
import { indentWidth } from "./lines";
import { LIST_KINDS, nestedIndent, splitLine, type LineParts } from "./prefix";

/** A caret in source coordinates: zero-based line and UTF-16 column. */
export interface SourcePosition {
  line: number;
  column: number;
}

/** New source text and where the caret belongs in it. */
export interface Edit {
  source: string;
  caret: SourcePosition;
}

/** Block types whose source spans several lines, where Enter inserts a newline. */
const MULTI_LINE = new Set<Block["type"]>(["code", "table", "frontMatter", "callout", "toggle"]);

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const TODO_ITEM = /^([ \t]*)([-*+])( \[[ xX]\])(?:[ \t]+|$)/;
const BULLET_ITEM = /^([ \t]*)([-*+])(?:[ \t]+|$)/;
const NUMBERED_ITEM = /^([ \t]*)(\d{1,9})([.)])(?:[ \t]+|$)/;
const DIVIDER_LINE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const TODO_BOX = /^([ \t]*[-*+] \[)([ xX])\]/;

/** True for blocks edited as one line, where Enter starts a new block. */
export function isSingleLine(block: Block): boolean {
  return !MULTI_LINE.has(block.type);
}

/** The line ending at the end of a block's source, "" for a last line without one. */
function endingOf(raw: string): string {
  return raw.endsWith("\r\n") ? "\r\n" : raw.endsWith("\n") ? "\n" : "";
}

/** Number of source lines a block covers. */
export function blockLineCount(block: Block): number {
  const newlines = block.raw.split("\n").length - 1;
  return endingOf(block.raw) === "" ? newlines + 1 : newlines;
}

/** A block's editable text: its source without the final line ending, lines joined by `\n`. */
export function blockText(block: Block): string {
  return block.raw.replace(/\r?\n$/, "").replace(/\r\n/g, "\n");
}

/** Index of the block containing source line `line`, or -1. */
export function blockAtLine(blocks: readonly Block[], line: number): number {
  return blocks.findIndex(
    (block) => line >= block.line && line < block.line + blockLineCount(block),
  );
}

/** Caret offset in a block's text for a source position, clamped to the block. */
export function offsetInBlock(block: Block, position: SourcePosition): number {
  const rows = blockText(block).split("\n");
  const row = Math.min(Math.max(position.line - block.line, 0), rows.length - 1);
  let offset = 0;
  for (let index = 0; index < row; index += 1) offset += (rows[index]?.length ?? 0) + 1;
  return offset + Math.min(Math.max(position.column, 0), rows[row]?.length ?? 0);
}

/** Source position of offset `offset` in `text`, a block's text starting at line `startLine`. */
export function positionInText(startLine: number, text: string, offset: number): SourcePosition {
  const rows = text.slice(0, offset).split("\n");
  return { line: startLine + rows.length - 1, column: rows.at(-1)?.length ?? 0 };
}

/** Put a document back together from replacement block sources. */
function build(document: MarkdownDocument, raws: readonly string[]): string {
  return (document.bom ? "\uFEFF" : "") + raws.join("");
}

/** Source for `text`, joined with the document's line ending, followed by `ending`. */
function toRaw(document: MarkdownDocument, text: string, ending: string): string {
  return text.split("\n").join(ending || document.eol) + ending;
}

/**
 * Replace the text of block `index`, keeping its line ending. Typing an opening
 * code fence into a one-line block also adds the closing fence, so the rest of
 * the page does not turn into code.
 */
export function replaceBlockText(document: MarkdownDocument, index: number, text: string): string {
  const block = document.blocks[index];
  if (!block) return build(document, document.blocks.map((each) => each.raw));
  let next = text;
  const fence = isSingleLine(block) && !text.includes("\n") ? FENCE_OPEN.exec(text) : null;
  if (fence) {
    const marker = fence[1] ?? "";
    const info = text.slice(fence[0].length);
    if (!(marker.startsWith("`") && info.includes("`"))) {
      next = `${text}\n${fence[0].slice(0, fence[0].length - marker.length)}${marker}`;
    }
  }
  const raws = document.blocks.map((each) => each.raw);
  raws[index] = toRaw(document, next, endingOf(block.raw));
  return build(document, raws);
}

/** Insert `text` as new lines before block `at` (or at the end when `at` is the block count). */
export function insertLines(document: MarkdownDocument, at: number, text: string): string {
  const raws = document.blocks.map((block) => block.raw);
  const previous = raws[at - 1];
  if (previous !== undefined && endingOf(previous) === "") raws[at - 1] = previous + document.eol;
  raws.splice(at, 0, toRaw(document, text, document.eol));
  return build(document, raws);
}

/** Remove block `index` entirely. */
export function removeBlock(document: MarkdownDocument, index: number): string {
  return build(
    document,
    document.blocks.filter((_, at) => at !== index).map((block) => block.raw),
  );
}

/** The list marker that starts `line`, with the marker a new item after it should use. */
function listItem(line: string): { indent: string; marker: string; next: string } | null {
  if (DIVIDER_LINE.test(line)) return null;
  const todo = TODO_ITEM.exec(line);
  if (todo) {
    const [, indent = "", bullet = "-", box = ""] = todo;
    return { indent, marker: `${bullet}${box} `, next: `${indent}${bullet} [ ] ` };
  }
  const bullet = BULLET_ITEM.exec(line);
  if (bullet) {
    const [, indent = "", mark = "-"] = bullet;
    return { indent, marker: `${mark} `, next: `${indent}${mark} ` };
  }
  const numbered = NUMBERED_ITEM.exec(line);
  if (numbered) {
    const [, indent = "", number = "1", delimiter = "."] = numbered;
    return {
      indent,
      marker: `${number}${delimiter} `,
      next: `${indent}${Number(number) + 1}${delimiter} `,
    };
  }
  return null;
}

/**
 * The indentation one list level out from `indent` for the item at `index`:
 * the indentation of the nearest earlier item indented less, or none.
 */
function outdent(document: MarkdownDocument, index: number, indent: string): string {
  const width = indentWidth(indent);
  for (let at = index - 1; at >= 0; at -= 1) {
    const block = document.blocks[at];
    if (!block) break;
    if (block.type === "text" && block.text.trim() === "") continue;
    if (block.type !== "bullet" && block.type !== "numbered" && block.type !== "todo") break;
    const own = /^[ \t]*/.exec(block.raw)?.[0] ?? "";
    if (indentWidth(own) < width) return own;
  }
  return "";
}

/**
 * Enter at `offset` in block `index`, whose current text is `text`. The text
 * after the caret moves to a new line; list items continue the list, and Enter
 * on an empty item moves it one level out, then ends the list.
 */
export function splitBlock(
  document: MarkdownDocument,
  index: number,
  text: string,
  offset: number,
): Edit {
  const block = document.blocks[index];
  const line = block?.line ?? 0;
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  const item = listItem(before);
  if (item && before.trim() === item.marker.trim() && after.trim() === "") {
    const replacement = item.indent ? outdent(document, index, item.indent) + item.marker : "";
    return {
      source: replaceBlockText(document, index, replacement),
      caret: { line, column: replacement.length },
    };
  }
  const parts = splitLine(text);
  if (!item && parts.prefix !== "") {
    if (parts.content.trim() === "") return clearPrefix(document, index);
    if (offset <= parts.prefix.length) {
      return {
        source: replaceBlockText(document, index, `\n${text}`),
        caret: { line: line + 1, column: parts.prefix.length },
      };
    }
  }
  const continuation = item?.next ?? "";
  return {
    source: replaceBlockText(document, index, `${before}\n${continuation}${after}`),
    caret: { line: line + 1, column: continuation.length },
  };
}

/**
 * Turn block `index` into plain text by removing its marker and indentation,
 * for example Backspace at the start of a list item or heading.
 */
export function clearPrefix(document: MarkdownDocument, index: number): Edit {
  const block = document.blocks[index];
  const line = block?.line ?? 0;
  const content = block ? splitLine(blockText(block)).content : "";
  return { source: replaceBlockText(document, index, content), caret: { line, column: 0 } };
}

/**
 * The nearest list item before `index` at the same level as an item indented
 * by `width` or less, and whether it is the block right before `index`.
 */
function previousSibling(
  document: MarkdownDocument,
  index: number,
  width: number,
): { parts: LineParts; adjacent: boolean } | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    const block = document.blocks[at];
    if (!block || !isSingleLine(block)) return null;
    const parts = splitLine(blockText(block));
    if (!LIST_KINDS.has(parts.kind)) return null;
    if (indentWidth(parts.indent) <= width) return { parts, adjacent: at === index - 1 };
  }
  return null;
}

/**
 * Tab (`step` 1) or Shift+Tab (`step` -1) on list item `index`: nest it as the
 * last child of the item before it at the same level, or move it one level
 * out. A numbered item that starts a new nested list is numbered 1. Returns
 * null when the block is not a list item or cannot move. The caret is at the
 * start of the item's text.
 */
export function indentItem(document: MarkdownDocument, index: number, step: 1 | -1): Edit | null {
  const block = document.blocks[index];
  if (!block || !isSingleLine(block)) return null;
  const text = blockText(block);
  const parts = splitLine(text);
  if (!LIST_KINDS.has(parts.kind)) return null;
  let indent: string;
  let rest = text.slice(parts.indent.length);
  if (step < 0) {
    if (parts.indent === "") return null;
    indent = outdent(document, index, parts.indent);
  } else {
    const sibling = previousSibling(document, index, indentWidth(parts.indent));
    if (!sibling) return null;
    indent = nestedIndent(sibling.parts);
    if (indentWidth(parts.indent) >= indentWidth(indent)) return null;
    if (parts.kind === "numbered" && sibling.adjacent) rest = rest.replace(/^\d+/, "1");
  }
  const line = indent + rest;
  return {
    source: replaceBlockText(document, index, line),
    caret: { line: block.line, column: splitLine(line).prefix.length },
  };
}

/**
 * Typing `---` into an empty line makes a divider: the line becomes the
 * divider and the caret moves to a new empty line after it.
 */
export function insertDivider(document: MarkdownDocument, index: number): Edit {
  const block = document.blocks[index];
  const line = block?.line ?? 0;
  const divided = parseDocument(replaceBlockText(document, index, "---"));
  return { source: insertLines(divided, index + 1, ""), caret: { line: line + 1, column: 0 } };
}

/** Block types a line can be turned into from the slash menu. */
export type TurnIntoKind =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "divider";

/** The marker a one-line block of `kind` starts with, without indentation. */
function markerFor(kind: Exclude<TurnIntoKind, "code" | "divider">): string {
  switch (kind) {
    case "text":
      return "";
    case "bullet":
      return "- ";
    case "numbered":
      return "1. ";
    case "todo":
      return "- [ ] ";
    case "quote":
      return "> ";
    default:
      return `${"#".repeat(Number(kind.slice(1)))} `;
  }
}

/**
 * Turn one-line block `index`, whose current text is `text` with the caret at
 * `offset`, into a block of `kind`, keeping its words. A list item keeps its
 * indentation when it stays a list item. A divider replaces an empty line, or
 * goes after the line (with a blank line, so the text never becomes a
 * heading). Returns null for multi-line blocks.
 */
export function turnInto(
  document: MarkdownDocument,
  index: number,
  text: string,
  offset: number,
  kind: TurnIntoKind,
): Edit | null {
  const block = document.blocks[index];
  if (!block || !isSingleLine(block) || text.includes("\n")) return null;
  const parts = splitLine(text);
  const column = Math.min(Math.max(offset - parts.prefix.length, 0), parts.content.length);
  if (kind === "divider") {
    if (text.trim() === "") return insertDivider(document, index);
    const kept = parseDocument(replaceBlockText(document, index, text));
    return {
      source: insertLines(kept, index + 1, "\n---\n"),
      caret: { line: block.line + 3, column: 0 },
    };
  }
  if (kind === "code") {
    return {
      source: replaceBlockText(document, index, `\`\`\`\n${parts.content}\n\`\`\``),
      caret: { line: block.line + 1, column },
    };
  }
  const toList = kind === "bullet" || kind === "numbered" || kind === "todo";
  const indent = toList && LIST_KINDS.has(parts.kind) ? parts.indent : "";
  const prefix = indent + markerFor(kind);
  return {
    source: replaceBlockText(document, index, prefix + parts.content),
    caret: { line: block.line, column: prefix.length + column },
  };
}

/**
 * Put the link line `link` in place of block `index` when that block is an
 * empty line, or on a new line after it otherwise.
 */
export function insertLinkLine(document: MarkdownDocument, index: number, link: string): Edit {
  const block = document.blocks[index];
  if (block && isSingleLine(block) && blockText(block).trim() === "") {
    return {
      source: replaceBlockText(document, index, link),
      caret: { line: block.line, column: link.length },
    };
  }
  const after = block ?? document.blocks.at(-1);
  const at = block ? index + 1 : document.blocks.length;
  const line = after ? after.line + blockLineCount(after) : 0;
  return { source: insertLines(document, at, link), caret: { line, column: link.length } };
}

/** Multi-line blocks the slash menu adds from a template. */
export type TemplateKind = "table" | "callout" | "toggle";

/** Each template's lines and where the caret goes in them. */
const TEMPLATES: Record<TemplateKind, { lines: readonly string[]; caret: SourcePosition }> = {
  table: {
    lines: ["| Column 1 | Column 2 |", "| --- | --- |", "|  |  |"],
    caret: { line: 2, column: 2 },
  },
  callout: { lines: ["> [!NOTE]", "> "], caret: { line: 1, column: 2 } },
  toggle: {
    lines: ["<details>", "<summary>Toggle</summary>", "", "", "</details>"],
    caret: { line: 3, column: 0 },
  },
};

/**
 * Add a `kind` block from its template for one-line block `index`, whose
 * text is now `text`: the template replaces a line without words and goes
 * after a line with words. Returns null for a multi-line block.
 */
export function insertTemplate(
  document: MarkdownDocument,
  index: number,
  text: string,
  kind: TemplateKind,
): Edit | null {
  const block = document.blocks[index];
  if (!block || !isSingleLine(block) || text.includes("\n")) return null;
  const template = TEMPLATES[kind];
  const source = template.lines.join("\n");
  if (splitLine(text).content.trim() === "") {
    return {
      source: replaceBlockText(document, index, source),
      caret: { line: block.line + template.caret.line, column: template.caret.column },
    };
  }
  const kept = parseDocument(replaceBlockText(document, index, text));
  return {
    source: insertLines(kept, index + 1, source),
    caret: { line: block.line + 1 + template.caret.line, column: template.caret.column },
  };
}

/**
 * Backspace at the start of block `index`: join it to the end of the block
 * before it. An empty block after a title or multi-line block is removed
 * instead. Returns null when nothing should happen.
 */
export function mergeWithPrevious(document: MarkdownDocument, index: number): Edit | null {
  const block = document.blocks[index];
  const previous = document.blocks[index - 1];
  if (!block || !previous) return null;
  const text = blockText(block);
  const previousText = blockText(previous);
  const end = positionInText(previous.line, previousText, previousText.length);
  if (!isSingleLine(previous) || index - 1 === titleBlockIndex(document.blocks)) {
    return text === "" ? { source: removeBlock(document, index), caret: end } : null;
  }
  const raws = document.blocks.map((each) => each.raw);
  raws.splice(index - 1, 2, previousText + text + endingOf(block.raw));
  return { source: build(document, raws), caret: end };
}

/** Blocks `start` to `end` (exclusive) that move, copy, and delete together. */
export interface BlockGroup {
  start: number;
  end: number;
}

/**
 * Block `index` and what belongs to it: a list item takes the items nested
 * under it; every other block stands alone.
 */
export function blockGroup(document: MarkdownDocument, index: number): BlockGroup {
  const blocks = document.blocks;
  const block = blocks[index];
  if (!block || !isSingleLine(block)) return { start: index, end: index + 1 };
  const parts = splitLine(blockText(block));
  if (!LIST_KINDS.has(parts.kind)) return { start: index, end: index + 1 };
  const width = indentWidth(parts.indent);
  let end = index + 1;
  for (let next = blocks[end]; next && isSingleLine(next); next = blocks[end]) {
    const nested = splitLine(blockText(next));
    if (!LIST_KINDS.has(nested.kind) || indentWidth(nested.indent) <= width) break;
    end += 1;
  }
  return { start: index, end };
}

/** The first block index a block may be moved to: after front matter and the title. */
function firstMovable(document: MarkdownDocument): number {
  const title = titleBlockIndex(document.blocks);
  const front = document.blocks[0]?.type === "frontMatter" ? 1 : 0;
  return Math.max(front, title + 1);
}

/** Source line of block `index` in a list of block sources. */
function lineOf(raws: readonly string[], index: number): number {
  let line = 0;
  for (const raw of raws.slice(0, index)) line += raw.split("\n").length - 1;
  return line;
}

/** Block sources where every block ends with a line ending. */
function endedRaws(document: MarkdownDocument): string[] {
  return document.blocks.map((block) =>
    endingOf(block.raw) === "" ? block.raw + document.eol : block.raw,
  );
}

/**
 * Move block `index` and the items nested under it so they come before the
 * block now at `before` (the block count moves them to the end). Nothing
 * moves above the title or front matter. Returns null when nothing would
 * change, or for the title and front matter themselves. The caret goes to
 * the start of the moved block.
 */
export function moveBlock(document: MarkdownDocument, index: number, before: number): Edit | null {
  const first = firstMovable(document);
  if (index < first || index >= document.blocks.length) return null;
  const group = blockGroup(document, index);
  const target = Math.min(Math.max(before, first), document.blocks.length);
  if (target >= group.start && target <= group.end) return null;
  const raws = endedRaws(document);
  const moved = raws.splice(group.start, group.end - group.start);
  const at = target > group.start ? target - moved.length : target;
  raws.splice(at, 0, ...moved);
  return { source: build(document, raws), caret: { line: lineOf(raws, at), column: 0 } };
}

/**
 * Move block `index` (with its nested items) one step up or down: above the
 * block before it, or below the next block and its nested items.
 */
export function moveBlockBy(document: MarkdownDocument, index: number, step: 1 | -1): Edit | null {
  const group = blockGroup(document, index);
  if (step > 0) {
    if (group.end >= document.blocks.length) return null;
    return moveBlock(document, index, blockGroup(document, group.end).end);
  }
  const level = levelOf(document, index);
  for (let at = group.start - 1; at >= 0; at -= 1) {
    if (blockGroup(document, at).end >= group.start && levelOf(document, at) <= level) {
      return moveBlock(document, index, at);
    }
  }
  return null;
}

/** How far block `index` is nested: a list item's indentation width, 0 for other blocks. */
function levelOf(document: MarkdownDocument, index: number): number {
  const block = document.blocks[index];
  if (!block || !isSingleLine(block)) return 0;
  const parts = splitLine(blockText(block));
  return LIST_KINDS.has(parts.kind) ? indentWidth(parts.indent) : 0;
}

/**
 * Copy block `index` (with its nested items) right after itself. The caret
 * goes to the start of the copy.
 */
export function duplicateBlock(document: MarkdownDocument, index: number): Edit | null {
  if (!document.blocks[index] || document.blocks[index]?.type === "frontMatter") return null;
  const group = blockGroup(document, index);
  const raws = endedRaws(document);
  raws.splice(group.end, 0, ...raws.slice(group.start, group.end));
  return { source: build(document, raws), caret: { line: lineOf(raws, group.end), column: 0 } };
}

/**
 * Delete block `index` and the items nested under it. The caret goes to the
 * end of the block before them, or the start of the page.
 */
export function deleteBlock(document: MarkdownDocument, index: number): Edit | null {
  if (!document.blocks[index]) return null;
  const group = blockGroup(document, index);
  const raws = document.blocks.map((block) => block.raw);
  raws.splice(group.start, group.end - group.start);
  const previous = document.blocks[group.start - 1];
  const caret = previous
    ? positionInText(previous.line, blockText(previous), blockText(previous).length)
    : { line: 0, column: 0 };
  return { source: build(document, raws), caret };
}

/**
 * Turn fenced code block `index` back into plain lines of text, dropping its
 * fences. Returns null for other blocks.
 */
export function unwrapCode(document: MarkdownDocument, index: number): Edit | null {
  const block = document.blocks[index];
  if (!block || block.type !== "code") return null;
  const rows = blockText(block).split("\n").slice(1);
  if (block.closed) rows.pop();
  return {
    source: replaceBlockText(document, index, rows.join("\n")),
    caret: { line: block.line, column: 0 },
  };
}

/** Check or uncheck the to-do item at block `index`. */
export function toggleTodo(document: MarkdownDocument, index: number): string {
  const raws = document.blocks.map((block) => block.raw);
  const raw = raws[index];
  if (raw !== undefined) {
    raws[index] = raw.replace(TODO_BOX, (_, open: string, mark: string) =>
      `${open}${mark === " " ? "x" : " "}]`,
    );
  }
  return build(document, raws);
}

/** The editable title: the title line after its `# `, or "" when the page has none. */
export function titleText(document: MarkdownDocument): string {
  const block = document.blocks[titleBlockIndex(document.blocks)];
  return block ? blockText(block).slice(2) : "";
}

/**
 * Set the page title line. An empty title removes the line, so the folder
 * name is shown instead; a page without one gets a new first line (after any
 * front matter).
 */
export function setTitle(document: MarkdownDocument, title: string): string {
  const text = title.replace(/[\r\n]+/g, " ");
  const index = titleBlockIndex(document.blocks);
  if (text.trim() === "") {
    return index >= 0
      ? removeBlock(document, index)
      : build(document, document.blocks.map((block) => block.raw));
  }
  if (index >= 0) return replaceBlockText(document, index, `# ${text}`);
  return insertLines(document, document.blocks[0]?.type === "frontMatter" ? 1 : 0, `# ${text}`);
}
