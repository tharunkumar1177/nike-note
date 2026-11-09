/**
 * A table edited like Notion's (see blueprints/rich-blocks.md): clicking a
 * cell edits that cell's text, the keyboard moves between cells, the + bars
 * add a row or a column, and the row and column handles open menus to insert,
 * move, align, or delete. Every change goes back to the page as Markdown
 * through `onEdit`.
 */
import {
  alignColumn,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  parseInline,
  parseTable,
  rowCount,
  setCell,
  toggleMark,
  type Block,
  type CellAlign,
  type CellPosition,
  type Mark,
  type TableCells,
} from "@quire/markdown";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { InlineView } from "./InlineView";
import { menuBelow, PopoverMenu, type MenuItem, type MenuPlace } from "./PopoverMenu";

/** Where the caret goes when a cell starts being edited. */
type Entry = "start" | "end";

/** The open row or column menu and where it is shown. */
interface OpenMenu extends MenuPlace {
  kind: "row" | "column";
  index: number;
}

/** The CSS text alignment for a column alignment. */
function alignStyle(align: CellAlign | undefined): CSSProperties | undefined {
  return align ? { textAlign: align } : undefined;
}

/** The style a formatting shortcut toggles, or null for other keys. */
function shortcutMark(event: KeyboardEvent<HTMLTextAreaElement>): Mark | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.shiftKey) return key === "x" || key === "s" ? "strike" : key === "e" ? "math" : null;
  return key === "b" ? "bold" : key === "i" ? "italic" : key === "e" ? "code" : null;
}

/**
 * The text box of the cell being edited. It keeps what was typed, including
 * spaces at either end that the Markdown cell trims, until the page's text
 * for the cell differs from it.
 */
function CellBox({
  text,
  entry,
  label,
  onType,
  onKeyDown,
  onBlur,
}: {
  text: string;
  entry: Entry;
  label: string;
  onType: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>, setText: (value: Selection) => void) => void;
  onBlur: (event: FocusEvent<HTMLTextAreaElement>) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(text);
  const selection = useRef<Selection | null>(null);
  const firstEntry = useRef(entry);
  const value = draft.trim() === text ? draft : text;

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    element.focus();
    const at = firstEntry.current === "start" ? 0 : element.value.length;
    element.setSelectionRange(at, at);
  }, []);

  useLayoutEffect(() => {
    const element = box.current;
    const pending = selection.current;
    if (!element || !pending) return;
    selection.current = null;
    element.setSelectionRange(pending.start, pending.end);
  });

  /** Replace the text and select a range of it after the next render. */
  const setText = (next: Selection): void => {
    selection.current = next;
    setDraft(next.text);
    onType(next.text);
  };

  return (
    <textarea
      ref={box}
      className="table-editor__input"
      rows={1}
      value={value}
      aria-label={label}
      onChange={(event) => {
        const next = event.currentTarget.value.replace(/\r?\n/g, " ");
        setDraft(next);
        onType(next);
      }}
      onKeyDown={(event) => onKeyDown(event, setText)}
      onBlur={onBlur}
    />
  );
}

/** Text with a selected range, after a formatting shortcut. */
interface Selection {
  text: string;
  start: number;
  end: number;
}

/** Small grip drawn on row and column handles. */
function Grip({ vertical }: { vertical: boolean }) {
  const dots = [3, 8, 13];
  return (
    <svg
      width={vertical ? 6 : 16}
      height={vertical ? 16 : 6}
      viewBox={vertical ? "0 0 6 16" : "0 0 16 6"}
      aria-hidden="true"
    >
      {dots.map((at) =>
        vertical ? <circle key={at} cx="3" cy={at} r="1.3" /> : <circle key={at} cx={at} cy="3" r="1.3" />,
      )}
    </svg>
  );
}

/**
 * Render table `block` as an editable grid. `cell` is the cell being edited,
 * or null. `onSelect` starts editing a cell, `onEdit` saves new cells and the
 * cell to edit next (null to stop), `onExit` leaves the table upwards (-1) or
 * downwards (1) with the arrow keys, and `onLeave` reports that focus left
 * the table.
 */
export function TableEditor({
  block,
  pagePath,
  cell,
  onSelect,
  onEdit,
  onExit,
  onLeave,
}: {
  block: Extract<Block, { type: "table" }>;
  pagePath: string;
  cell: CellPosition | null;
  onSelect: (cell: CellPosition) => void;
  onEdit: (table: TableCells, next: CellPosition | null) => void;
  onExit: (step: -1 | 1) => void;
  onLeave: () => void;
}) {
  const table = parseTable(block.source);
  const columns = table.header.length;
  const rows = rowCount(table);
  const [hoverColumn, setHoverColumn] = useState<number | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [entry, setEntry] = useState<Entry>("end");
  const root = useRef<HTMLDivElement>(null);
  const editing =
    cell === null
      ? null
      : { row: Math.min(cell.row, rows - 1), column: Math.min(cell.column, columns - 1) };

  useEffect(() => {
    if (menu === null) return;
    const onScroll = (): void => setMenu(null);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [menu]);

  /** Edit cell `next`, with the caret at its start or end. */
  const go = (next: CellPosition, at: Entry = "end"): void => {
    setEntry(at);
    onSelect(next);
  };

  /** Save `next` and edit cell `target` afterwards, with the caret at its end. */
  const edit = (next: TableCells, target: CellPosition | null): void => {
    setEntry("end");
    onEdit(next, target);
  };

  /** Add an empty row at the end and edit its cell in column `column`. */
  const addRow = (column: number): void => edit(insertRow(table, table.rows.length), { row: rows, column });

  /** Add an empty column at the end and edit its header cell. */
  const addColumn = (): void => edit(insertColumn(table, columns), { row: 0, column: columns });

  /**
   * Keys in the cell being edited: Tab and Shift+Tab move along the rows
   * (Tab in the last cell adds a row), Enter moves down (adding a row at the
   * bottom), the arrow keys cross cell edges, Escape stops editing, and the
   * formatting shortcuts style the selection.
   */
  const onCellKey =
    (at: CellPosition) =>
    (event: KeyboardEvent<HTMLTextAreaElement>, setText: (value: Selection) => void): void => {
      if (event.nativeEvent.isComposing) return;
      const { selectionStart: start, selectionEnd: end, value } = event.currentTarget;
      const collapsed = start === end;
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      const mark = shortcutMark(event);
      const last = { row: rows - 1, column: columns - 1 };
      if (mark) {
        event.preventDefault();
        const result = toggleMark(value, start, end, mark);
        setText({ text: result.text, start: result.start, end: result.end });
      } else if (event.key === "Tab" && plain) {
        event.preventDefault();
        if (event.shiftKey) {
          if (at.column > 0) go({ row: at.row, column: at.column - 1 });
          else if (at.row > 0) go({ row: at.row - 1, column: columns - 1 });
        } else if (at.column < last.column) {
          go({ row: at.row, column: at.column + 1 });
        } else if (at.row < last.row) {
          go({ row: at.row + 1, column: 0 });
        } else {
          addRow(0);
        }
      } else if (event.key === "Enter" && plain) {
        event.preventDefault();
        if (at.row < last.row) go({ row: at.row + 1, column: at.column });
        else addRow(at.column);
      } else if (event.key === "ArrowUp" && plain && !event.shiftKey) {
        event.preventDefault();
        if (at.row > 0) go({ row: at.row - 1, column: at.column });
        else onExit(-1);
      } else if (event.key === "ArrowDown" && plain && !event.shiftKey) {
        event.preventDefault();
        if (at.row < last.row) go({ row: at.row + 1, column: at.column });
        else onExit(1);
      } else if (event.key === "ArrowLeft" && plain && !event.shiftKey && collapsed && start === 0) {
        if (at.column === 0 && at.row === 0) return;
        event.preventDefault();
        go(at.column > 0 ? { row: at.row, column: at.column - 1 } : { row: at.row - 1, column: last.column });
      } else if (
        event.key === "ArrowRight" &&
        plain &&
        !event.shiftKey &&
        collapsed &&
        end === value.length
      ) {
        if (at.column === last.column && at.row === last.row) return;
        event.preventDefault();
        go(at.column < last.column ? { row: at.row, column: at.column + 1 } : { row: at.row + 1, column: 0 }, "start");
      } else if (event.key === "Escape") {
        event.preventDefault();
        onLeave();
      }
    };

  /** Start editing the clicked cell, unless a link inside it was clicked. */
  const onCellDown = (at: CellPosition) => (event: MouseEvent<HTMLTableCellElement>) => {
    if (event.target instanceof Element && event.target.closest("a, button, textarea")) return;
    event.preventDefault();
    go(at);
  };

  /** Open the menu of row or column `index` under handle `button`. */
  const openMenu = (kind: OpenMenu["kind"], index: number, button: HTMLElement): void => {
    setMenu({ kind, index, ...menuBelow(button) });
  };

  /** Focus left the cell: report it unless focus stayed in the table or its menu. */
  const onBlur = (event: FocusEvent<HTMLTextAreaElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && root.current?.contains(next)) return;
    onLeave();
  };

  /** The entries of the open menu. */
  const menuItems = (open: OpenMenu): (MenuItem | "separator")[] => {
    const target = editing ?? { row: 0, column: 0 };
    if (open.kind === "column") {
      const column = open.index;
      const align = table.align[column] ?? null;
      const aligned = (to: CellAlign, label: string): MenuItem => ({
        label,
        checked: (align ?? "left") === to,
        run: () => edit(alignColumn(table, column, to === "left" && align === null ? null : to), null),
      });
      return [
        aligned("left", "Align left"),
        aligned("center", "Align center"),
        aligned("right", "Align right"),
        "separator",
        { label: "Insert column left", run: () => edit(insertColumn(table, column), { row: 0, column }) },
        {
          label: "Insert column right",
          run: () => edit(insertColumn(table, column + 1), { row: 0, column: column + 1 }),
        },
        {
          label: "Move column left",
          disabled: column === 0,
          run: () => edit(moveColumn(table, column, column - 1), { row: target.row, column: column - 1 }),
        },
        {
          label: "Move column right",
          disabled: column === columns - 1,
          run: () => edit(moveColumn(table, column, column + 1), { row: target.row, column: column + 1 }),
        },
        "separator",
        {
          label: "Delete column",
          danger: true,
          disabled: columns === 1,
          run: () => edit(deleteColumn(table, column), null),
        },
      ];
    }
    const row = open.index;
    const body = row - 1;
    const insertBelow: MenuItem = {
      label: "Insert row below",
      run: () => edit(insertRow(table, body + 1), { row: row + 1, column: target.column }),
    };
    if (row === 0) return [insertBelow];
    return [
      {
        label: "Insert row above",
        run: () => edit(insertRow(table, body), { row, column: target.column }),
      },
      insertBelow,
      "separator",
      {
        label: "Move row up",
        disabled: row === 1,
        run: () => edit(moveRow(table, body, body - 1), { row: row - 1, column: target.column }),
      },
      {
        label: "Move row down",
        disabled: row === rows - 1,
        run: () => edit(moveRow(table, body, body + 1), { row: row + 1, column: target.column }),
      },
      "separator",
      { label: "Delete row", danger: true, run: () => edit(deleteRow(table, body), null) },
    ];
  };

  /** One cell: its text box while edited, otherwise its formatted text. */
  const renderCell = (text: string, at: CellPosition) => {
    const Tag = at.row === 0 ? "th" : "td";
    const active = editing?.row === at.row && editing.column === at.column;
    const showColumn =
      at.row === 0 &&
      (hoverColumn === at.column ||
        editing?.column === at.column ||
        (menu?.kind === "column" && menu.index === at.column));
    const showRow = editing?.row === at.row || (menu?.kind === "row" && menu.index === at.row);
    return (
      <Tag
        key={at.column}
        scope={at.row === 0 ? "col" : undefined}
        className={active ? "table-editor__cell--active" : undefined}
        style={alignStyle(table.align[at.column])}
        data-column={at.column}
        onMouseDown={onCellDown(at)}
      >
        {at.row === 0 && (
          <button
            type="button"
            className={`table-editor__handle table-editor__handle--column${showColumn ? " table-editor__handle--shown" : ""}`}
            aria-label={`Column ${at.column + 1} actions`}
            aria-haspopup="menu"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => openMenu("column", at.column, event.currentTarget)}
          >
            <Grip vertical={false} />
          </button>
        )}
        {at.column === 0 && (
          <button
            type="button"
            className={`table-editor__handle table-editor__handle--row${showRow ? " table-editor__handle--shown" : ""}`}
            aria-label={at.row === 0 ? "Header row actions" : `Row ${at.row} actions`}
            aria-haspopup="menu"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => openMenu("row", at.row, event.currentTarget)}
          >
            <Grip vertical />
          </button>
        )}
        {active ? (
          <CellBox
            key={`${at.row}:${at.column}`}
            text={text}
            entry={entry}
            label={at.row === 0 ? `Header ${at.column + 1}` : `Row ${at.row}, column ${at.column + 1}`}
            onType={(value) => onEdit(setCell(table, at, value), at)}
            onKeyDown={onCellKey(at)}
            onBlur={onBlur}
          />
        ) : (
          <InlineView nodes={parseInline(text)} pagePath={pagePath} />
        )}
      </Tag>
    );
  };

  return (
    <div
      ref={root}
      className={`block block--table table-editor${editing ? " table-editor--editing" : ""}`}
      onMouseOver={(event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-column]") : null;
        if (!(target instanceof HTMLElement) || menu !== null) return;
        const column = Number(target.dataset.column);
        if (column !== hoverColumn) setHoverColumn(column);
      }}
      onMouseLeave={() => {
        if (menu === null) setHoverColumn(null);
      }}
    >
      <div className="table-editor__grid">
        <table aria-label="Table">
          <thead>
            <tr>{table.header.map((text, column) => renderCell(text, { row: 0, column }))}</tr>
          </thead>
          <tbody>
            {table.rows.map((row, body) => (
              <tr key={body}>
                {row.map((text, column) => renderCell(text, { row: body + 1, column }))}
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          className="table-editor__add table-editor__add--column"
          aria-label="Add column"
          title="Add column"
          onMouseDown={(event) => event.preventDefault()}
          onClick={addColumn}
        >
          +
        </button>
        <button
          type="button"
          className="table-editor__add table-editor__add--row"
          aria-label="Add row"
          title="Add row"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => addRow(0)}
        >
          +
        </button>
      </div>
      {menu && (
        <PopoverMenu
          key={`${menu.kind}-${menu.index}`}
          place={menu}
          label={menu.kind === "column" ? `Column ${menu.index + 1}` : menu.index === 0 ? "Header row" : `Row ${menu.index}`}
          items={menuItems(menu)}
          onClose={() => {
            setMenu(null);
            root.current?.querySelector("textarea")?.focus();
          }}
        />
      )}
    </div>
  );
}
