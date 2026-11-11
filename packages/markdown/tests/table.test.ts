/**
 * Tests for table edits: cell changes, rows and columns added, moved, and
 * deleted, alignment, escaping, and writing back only the changed rows.
 */
import { describe, expect, it } from "vitest";

import {
  alignColumn,
  cellText,
  deleteColumn,
  deleteRow,
  escapeCell,
  formatDelimiter,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  parseTable,
  rowCount,
  setCell,
  tableSource,
} from "../src/table";

/** A table written by hand, with spacing Quire would not produce. */
const SOURCE = "|Name|Qty|\n|:--|--:|\n|apple|  3 |\n|pear|5|";

describe("escapeCell and formatting", () => {
  it("escapes pipes and flattens line breaks", () => {
    expect(escapeCell("a | b")).toBe("a \\| b");
    expect(escapeCell("one\r\ntwo\nthree")).toBe("one two three");
  });

  it("writes each alignment's delimiter", () => {
    expect(formatDelimiter([null, "left", "center", "right"])).toBe(
      "| --- | :--- | :---: | ---: |",
    );
  });
});

describe("tableSource", () => {
  it("keeps every line when nothing changed", () => {
    expect(tableSource(SOURCE, parseTable(SOURCE))).toBe(SOURCE);
  });

  it("rewrites only the row whose cell changed", () => {
    const table = setCell(parseTable(SOURCE), { row: 2, column: 0 }, "pear | quince");
    expect(tableSource(SOURCE, table)).toBe(
      "|Name|Qty|\n|:--|--:|\n|apple|  3 |\n| pear \\| quince | 5 |",
    );
  });

  it("round-trips an escaped pipe through editing", () => {
    const source = "| A |\n| --- |\n| x \\| y |";
    const table = parseTable(source);
    expect(cellText(table, { row: 1, column: 0 })).toBe("x | y");
    expect(tableSource(source, setCell(table, { row: 1, column: 0 }, "x | y"))).toBe(source);
  });

  it("rewrites the delimiter when alignment changes", () => {
    const table = alignColumn(parseTable(SOURCE), 0, "center");
    expect(tableSource(SOURCE, table).split("\n")[1]).toBe("| :---: | ---: |");
  });

  it("rewrites every row when the columns change", () => {
    expect(tableSource(SOURCE, insertColumn(parseTable(SOURCE), 1))).toBe(
      "| Name |  | Qty |\n| :--- | --- | ---: |\n| apple |  | 3 |\n| pear |  | 5 |",
    );
  });
});

describe("rows", () => {
  it("inserts an empty row anywhere in the body", () => {
    const table = parseTable(SOURCE);
    expect(insertRow(table, 0).rows).toEqual([["", ""], ["apple", "3"], ["pear", "5"]]);
    expect(insertRow(table, 9).rows.at(-1)).toEqual(["", ""]);
    expect(rowCount(insertRow(table, 1))).toBe(4);
  });

  it("deletes and moves body rows", () => {
    const table = parseTable(SOURCE);
    expect(deleteRow(table, 0).rows).toEqual([["pear", "5"]]);
    expect(moveRow(table, 1, 0).rows).toEqual([["pear", "5"], ["apple", "3"]]);
    expect(moveRow(table, 1, 2)).toBe(table);
  });

  it("keeps a table with only a header row", () => {
    const table = deleteRow(deleteRow(parseTable(SOURCE), 0), 0);
    expect(tableSource(SOURCE, table)).toBe("|Name|Qty|\n|:--|--:|");
  });
});

describe("columns", () => {
  it("deletes a column but never the last one", () => {
    const table = deleteColumn(parseTable(SOURCE), 0);
    expect(table).toEqual({ align: ["right"], header: ["Qty"], rows: [["3"], ["5"]] });
    expect(deleteColumn(table, 0)).toBe(table);
  });

  it("moves a column with its alignment and cells", () => {
    expect(moveColumn(parseTable(SOURCE), 0, 1)).toEqual({
      align: ["right", "left"],
      header: ["Qty", "Name"],
      rows: [
        ["3", "apple"],
        ["5", "pear"],
      ],
    });
    expect(moveColumn(parseTable(SOURCE), 0, 2)).toEqual(parseTable(SOURCE));
  });

  it("sets the header text like any cell", () => {
    const table = setCell(parseTable(SOURCE), { row: 0, column: 1 }, "Count");
    expect(table.header).toEqual(["Name", "Count"]);
    expect(cellText(table, { row: 0, column: 1 })).toBe("Count");
    expect(cellText(table, { row: 7, column: 0 })).toBe("");
  });
});
