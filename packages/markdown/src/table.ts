/**
 * GitHub-flavored table cells (architecture.md#block-model-and-line-mapping).
 * A table block's source splits into a header row, a delimiter row that sets
 * each column's alignment, and body rows. Cells hold inline Markdown.
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
