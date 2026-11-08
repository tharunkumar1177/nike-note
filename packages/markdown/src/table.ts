/**
 * GitHub-flavored table cells (architecture.md#block-model-and-line-mapping).
 * A table block's source splits into a header row, a delimiter row that sets
 * each column's alignment, and body rows. Cells hold inline Markdown. Edits
 * work on the cells and write back only the rows they change.
 */

/** How a column's cells are aligned; null when the delimiter sets none. */
export type CellAlign = "left" | "center" | "right" | null;

/** A table's cells, every row padded or cut to the header's column count. */
export interface TableCells {
  align: CellAlign[];
  header: string[];
  rows: string[][];
}

/**
 * Split one table row into trimmed cells. Leading and trailing pipes are
 * optional; `\|` is a literal pipe inside a cell and is unescaped.
 */
export function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const char of text) {
    if (escaped) {
      cell += char === "|" ? "|" : `\\${char}`;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  if (escaped) cell += "\\";
  if (cell.trim() !== "" || cells.length === 0) cells.push(cell.trim());
  return cells;
}

/** The alignment a delimiter cell such as `:--:` sets. */
function alignOf(cell: string): CellAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  return left && right ? "center" : right ? "right" : left ? "left" : null;
}

/** Pad or cut `cells` to `count` columns. */
function fit(cells: readonly string[], count: number): string[] {
  return Array.from({ length: count }, (_, column) => cells[column] ?? "");
}

/**
 * The cells of a table block's source (lines joined by `\n`, as in the
 * block's `source`). The header row sets the column count.
 */
export function parseTable(source: string): TableCells {
  const [headerLine = "", delimiterLine = "", ...bodyLines] = source.split("\n");
  const header = splitRow(headerLine);
  const count = header.length;
  return {
    align: fit(splitRow(delimiterLine), count).map(alignOf),
    header,
    rows: bodyLines.map((line) => fit(splitRow(line), count)),
  };
}

/**
 * A cell's text as it goes into a row: a line break becomes a space, since a
 * row is one line, and `|` is escaped as `\|`.
 */
export function escapeCell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

/** One table row with a pipe at each end and one space around each cell. */
export function formatRow(cells: readonly string[]): string {
  return `| ${cells.map(escapeCell).join(" | ")} |`;
}

/** Delimiter cells for each alignment. */
const DELIMITERS: Record<Exclude<CellAlign, null> | "none", string> = {
  none: "---",
  left: ":---",
  center: ":---:",
  right: "---:",
};

/** The delimiter row for column alignments `align`. */
export function formatDelimiter(align: readonly CellAlign[]): string {
  return `| ${align.map((each) => DELIMITERS[each ?? "none"]).join(" | ")} |`;
}

/** True when two cell lists hold the same text. */
function sameCells(a: readonly unknown[] | undefined, b: readonly unknown[]): boolean {
  return a !== undefined && a.length === b.length && a.every((cell, at) => cell === b[at]);
}

/**
 * The source of table `previous` after its cells became `next`. A row whose
 * cells did not change keeps its line exactly; every other row, and the
 * delimiter row when the columns or alignments changed, is written afresh.
 */
export function tableSource(previous: string, next: TableCells): string {
  const lines = previous.split("\n");
  const old = parseTable(previous);
  const width = old.header.length === next.header.length;
  const keep = (line: string | undefined, before: readonly string[] | undefined, cells: string[]) =>
    width && line !== undefined && sameCells(before, cells) ? line : formatRow(cells);
  const delimiter =
    width && lines[1] !== undefined && sameCells(old.align, next.align)
      ? lines[1]
      : formatDelimiter(next.align);
  return [
    keep(lines[0], old.header, next.header),
    delimiter,
    ...next.rows.map((row, at) => keep(lines[at + 2], old.rows[at], row)),
  ].join("\n");
}

/**
 * A cell: row 0 is the header and row 1 the first body row; columns count
 * from 0.
 */
export interface CellPosition {
  row: number;
  column: number;
}

/** The number of rows, counting the header. */
export function rowCount(table: TableCells): number {
  return table.rows.length + 1;
}

/** The text of cell `at`, or "" outside the table. */
export function cellText(table: TableCells, at: CellPosition): string {
  const row = at.row === 0 ? table.header : table.rows[at.row - 1];
  return row?.[at.column] ?? "";
}

/** Table `table` with cell `at` set to `text`. */
export function setCell(table: TableCells, at: CellPosition, text: string): TableCells {
  const change = (row: string[]) => row.map((cell, column) => (column === at.column ? text : cell));
  if (at.row === 0) return { ...table, header: change(table.header) };
  return {
    ...table,
    rows: table.rows.map((row, index) => (index === at.row - 1 ? change(row) : row)),
  };
}

/** Table `table` with an empty body row inserted at body index `at` (0 is first). */
export function insertRow(table: TableCells, at: number): TableCells {
  const rows = [...table.rows];
  rows.splice(Math.max(0, Math.min(at, rows.length)), 0, table.header.map(() => ""));
  return { ...table, rows };
}

/** Table `table` without body row `at`. */
export function deleteRow(table: TableCells, at: number): TableCells {
  return { ...table, rows: table.rows.filter((_, index) => index !== at) };
}

/** Move an item of `items` from index `from` to index `to`. */
function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const moved = [...items];
  const [item] = moved.splice(from, 1);
  if (item !== undefined) moved.splice(to, 0, item);
  return moved;
}

/** Table `table` with body row `from` moved to body index `to`. */
export function moveRow(table: TableCells, from: number, to: number): TableCells {
  const last = table.rows.length - 1;
  if (from < 0 || from > last || to < 0 || to > last || from === to) return table;
  return { ...table, rows: moveItem(table.rows, from, to) };
}

/** Table `table` with an empty column inserted at column `at`. */
export function insertColumn(table: TableCells, at: number): TableCells {
  const index = Math.max(0, Math.min(at, table.header.length));
  /** Insert `value` into `row` at the new column. */
  const add = <T>(row: readonly T[], value: T): T[] => {
    const next = [...row];
    next.splice(index, 0, value);
    return next;
  };
  return {
    align: add(table.align, null),
    header: add(table.header, ""),
    rows: table.rows.map((row) => add(row, "")),
  };
}

/** Table `table` without column `at`; the last column is never removed. */
export function deleteColumn(table: TableCells, at: number): TableCells {
  if (table.header.length <= 1) return table;
  /** Drop the removed column from `row`. */
  const drop = <T>(row: readonly T[]): T[] => row.filter((_, column) => column !== at);
  return { align: drop(table.align), header: drop(table.header), rows: table.rows.map(drop) };
}

/** Table `table` with column `from` moved to column `to`. */
export function moveColumn(table: TableCells, from: number, to: number): TableCells {
  const last = table.header.length - 1;
  if (from < 0 || from > last || to < 0 || to > last || from === to) return table;
  return {
    align: moveItem(table.align, from, to),
    header: moveItem(table.header, from, to),
    rows: table.rows.map((row) => moveItem(row, from, to)),
  };
}

/** Table `table` with column `column` aligned `align`. */
export function alignColumn(table: TableCells, column: number, align: CellAlign): TableCells {
  return { ...table, align: table.align.map((each, at) => (at === column ? align : each)) };
}
