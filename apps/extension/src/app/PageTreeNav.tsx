/**
 * Sidebar page tree: the root page first, then its sub-pages as an expandable,
 * keyboard-navigable ARIA tree. Each row can add a sub-page, rename, move, or
 * delete its page (see blueprints/page-operations.md), and a row dragged onto
 * another moves the page inside it.
 */
import { useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import { ChevronIcon, HomeIcon, MoreIcon, PageIcon, PlusIcon } from "../shared/icons";
import { findPage, isAncestor, isWithin, parentPath, type PageNode } from "../shared/pages";
import {
  DeleteDialog,
  MENU_ANCHOR,
  MoveDialog,
  PageMenu,
  type PageAction,
} from "./PageActions";
import type { PageOps } from "./pageOps";
import { openPage } from "./route";

/** One visible row of the tree. */
interface Row {
  node: PageNode;
  depth: number;
  /** Path of the row's parent row; null for top-level rows. */
  parent: string | null;
}

/** Media type of a page path being dragged between rows. */
const DRAG_TYPE = "application/x-quire-page";

/**
 * Flatten the visible part of the tree into rows, in display order.
 */
function visibleRows(root: PageNode, isOpen: (path: string) => boolean): Row[] {
  const rows: Row[] = [{ node: root, depth: 0, parent: null }];
  const walk = (nodes: PageNode[], depth: number, parent: string | null): void => {
    for (const node of nodes) {
      rows.push({ node, depth, parent });
      if (node.children.length > 0 && isOpen(node.path)) walk(node.children, depth + 1, node.path);
    }
  };
  walk(root.children, 0, null);
  return rows;
}

/** Describe a failed page operation for the sidebar. */
function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The text box that replaces a row's title while it is renamed. Enter or
 * leaving it saves a changed, non-empty title; Escape cancels. `onDone` gets
 * the new title (null for none) and whether a key ended the rename.
 */
function RenameBox({
  title,
  onDone,
}: {
  title: string;
  onDone: (title: string | null, byKey: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  /** Finish once, with the typed value or null to cancel. */
  const finish = (value: string | null, byKey: boolean): void => {
    if (done.current) return;
    done.current = true;
    const next = value?.trim() ?? "";
    onDone(next === "" || next === title ? null : next, byKey);
  };
  return (
    <input
      ref={input}
      className="tree__rename"
      aria-label="Page title"
      defaultValue={title}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(event.currentTarget.value, true);
        else if (event.key === "Escape") finish(null, true);
      }}
      onBlur={(event) => finish(event.currentTarget.value, false)}
    />
  );
}

/** A menu position at viewport point `x`, `y`, kept inside the window. */
function menuAt(path: string, x: number, y: number): { path: string; left: number; top: number } {
  return {
    path,
    left: Math.max(Math.min(x, window.innerWidth - 232), 4),
    top: Math.max(Math.min(y, window.innerHeight - 180), 4),
  };
}

/**
 * Render the page tree with `selected` highlighted and its ancestors expanded.
 */
export function PageTreeNav({
  root,
  selected,
  ops,
}: {
  root: PageNode;
  selected: string;
  ops: PageOps;
}) {
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [focused, setFocused] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ path: string; left: number; top: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "move" | "delete"; path: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLLIElement>());

  const isOpen = (path: string): boolean => toggled.get(path) ?? isAncestor(path, selected);
  const rows = visibleRows(root, isOpen);
  const visible = (path: string | null): boolean => rows.some((row) => row.node.path === path);
  const tabStop = visible(focused) ? focused : visible(selected) ? selected : "";

  /**
   * Expand or collapse one page.
   */
  function setOpen(path: string, open: boolean): void {
    setToggled((previous) => new Map(previous).set(path, open));
  }

  /**
   * Move keyboard focus to a visible row.
   */
  function moveFocus(path: string): void {
    setFocused(path);
    items.current.get(path)?.focus();
  }

  /** Put focus back on row `path`, or on the nearest row that still exists. */
  function refocus(path: string): void {
    const target = findPage(root, path) ? path : parentPath(path);
    requestAnimationFrame(() => moveFocus(target));
  }

  /** Run a page operation, showing its failure under the tree. */
  function run(work: () => Promise<unknown>): void {
    setError(null);
    work().catch((reason: unknown) => setError(failure(reason)));
  }

  /** Add a sub-page of `path` and show it. */
  function create(path: string): void {
    if (path !== "") setOpen(path, true);
    run(() => ops.create(path));
  }

  /** Carry out a menu or keyboard action on page `path`. */
  function act(path: string, action: PageAction): void {
    setMenu(null);
    if (action === "create") create(path);
    else if (action === "rename") setRenaming(path);
    else if (path !== "") setDialog({ kind: action, path });
  }

  /** Open the row menu of page `path` below `anchor`. */
  function openMenu(path: string, anchor: Element): void {
    const box = anchor.getBoundingClientRect();
    setMenu(menuAt(path, box.left, box.bottom + 4));
  }

  /** True when the page being dragged may be dropped into page `target`. */
  function canDrop(target: string): boolean {
    return dragging !== null && !isWithin(target, dragging) && target !== parentPath(dragging);
  }

  /** Accept a dragged page over row `path` when it can move there. */
  function onDragOver(event: DragEvent, path: string): void {
    if (!canDrop(path)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTarget !== path) setDropTarget(path);
  }

  /** Move the dragged page into row `path`. */
  function onDrop(event: DragEvent, path: string): void {
    const from = dragging;
    event.preventDefault();
    setDragging(null);
    setDropTarget(null);
    if (from === null || !canDrop(path)) return;
    setOpen(path, true);
    run(() => ops.move(from, path));
  }

  /**
   * Arrow keys move and expand, Enter and Space open, Home and End jump. F2
   * renames, Delete deletes, and the context-menu key or Shift+F10 opens the
   * row menu.
   */
  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, index: number): void {
    const row = rows[index];
    if (!row) return;
    const { node } = row;
    const expandable = node.path !== "" && node.children.length > 0;
    switch (event.key) {
      case "ArrowDown": {
        const next = rows[index + 1];
        if (next) moveFocus(next.node.path);
        break;
      }
      case "ArrowUp": {
        const previous = rows[index - 1];
        if (previous) moveFocus(previous.node.path);
        break;
      }
      case "Home":
        moveFocus(root.path);
        break;
      case "End": {
        const last = rows.at(-1);
        if (last) moveFocus(last.node.path);
        break;
      }
      case "ArrowRight": {
        const first = node.children[0];
        if (!expandable || !first) break;
        if (isOpen(node.path)) moveFocus(first.path);
        else setOpen(node.path, true);
        break;
      }
      case "ArrowLeft":
        if (expandable && isOpen(node.path)) setOpen(node.path, false);
        else if (row.parent !== null) moveFocus(row.parent);
        break;
      case "Enter":
      case " ":
        openPage(node.path);
        break;
      case "F2":
        setRenaming(node.path);
        break;
      case "Delete":
        if (node.path === "") return;
        setDialog({ kind: "delete", path: node.path });
        break;
      case "ContextMenu":
        openMenu(node.path, event.currentTarget);
        break;
      case "F10":
        if (!event.shiftKey) return;
        openMenu(node.path, event.currentTarget);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const menuPage = menu ? findPage(root, menu.path) : null;
  const dialogPage = dialog ? findPage(root, dialog.path) : null;
  return (
    <>
      <ul className="tree" role="tree" aria-label="Pages">
        {rows.map((row, index) => {
          const { node, depth } = row;
          const isRoot = node.path === "";
          const expandable = !isRoot && node.children.length > 0;
          const open = expandable && isOpen(node.path);
          const current = node.path === selected;
          const classes = [
            "tree__item",
            current && "tree__item--selected",
            dropTarget === node.path && "tree__item--drop",
            dragging === node.path && "tree__item--dragging",
            menu?.path === node.path && "tree__item--menu",
          ];
          return (
            <li
              key={node.path}
              ref={(element) => {
                if (element) items.current.set(node.path, element);
                else items.current.delete(node.path);
              }}
              className={classes.filter(Boolean).join(" ")}
              role="treeitem"
              aria-label={node.title}
              aria-level={depth + 1}
              aria-expanded={expandable ? open : undefined}
              aria-selected={current}
              tabIndex={node.path === tabStop ? 0 : -1}
              draggable={!isRoot && renaming !== node.path}
              onClick={() => openPage(node.path)}
              onFocus={() => setFocused(node.path)}
              onKeyDown={(event) => onKeyDown(event, index)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu(menuAt(node.path, event.clientX, event.clientY));
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(DRAG_TYPE, node.path);
                setDragging(node.path);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropTarget(null);
              }}
              onDragOver={(event) => onDragOver(event, node.path)}
              onDragLeave={() => {
                if (dropTarget === node.path) setDropTarget(null);
              }}
              onDrop={(event) => onDrop(event, node.path)}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
            >
              {expandable ? (
                <span
                  className={open ? "tree__toggle tree__toggle--open" : "tree__toggle"}
                  aria-hidden="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(node.path, !open);
                  }}
                >
                  <ChevronIcon />
                </span>
              ) : (
                <span className="tree__toggle tree__toggle--empty" aria-hidden="true" />
              )}
              <span className="tree__icon" aria-hidden="true">
                {isRoot ? <HomeIcon /> : <PageIcon />}
              </span>
              {renaming === node.path ? (
                <RenameBox
                  title={node.title}
                  onDone={(title, byKey) => {
                    setRenaming(null);
                    if (byKey) refocus(node.path);
                    if (title !== null) run(() => ops.rename(node.path, title));
                  }}
                />
              ) : (
                <span className="tree__title">{node.title}</span>
              )}
              <span className="tree__actions">
                <button
                  type="button"
                  className="tree__action"
                  tabIndex={-1}
                  aria-label={`Actions for ${node.title}`}
                  aria-haspopup="menu"
                  {...{ [MENU_ANCHOR]: node.path }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (menu?.path === node.path) setMenu(null);
                    else openMenu(node.path, event.currentTarget);
                  }}
                >
                  <MoreIcon />
                </button>
                <button
                  type="button"
                  className="tree__action"
                  tabIndex={-1}
                  aria-label={`Add a page inside ${node.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    create(node.path);
                  }}
                >
                  <PlusIcon />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {error && (
        <div className="sidebar__note sidebar__note--error" role="alert">
          <p>{error}</p>
          <button type="button" className="sidebar__action" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {menu && menuPage && (
        <PageMenu
          path={menu.path}
          left={menu.left}
          top={menu.top}
          onChoose={(action) => act(menu.path, action)}
          onClose={(byKey) => {
            setMenu(null);
            if (byKey) refocus(menu.path);
          }}
        />
      )}
      {dialog?.kind === "move" && dialogPage && (
        <MoveDialog
          root={root}
          page={dialogPage}
          onMove={(parent) => {
            setDialog(null);
            setOpen(parent, true);
            run(() => ops.move(dialogPage.path, parent));
          }}
          onClose={() => {
            setDialog(null);
            refocus(dialogPage.path);
          }}
        />
      )}
      {dialog?.kind === "delete" && dialogPage && (
        <DeleteDialog
          page={dialogPage}
          onDelete={() => {
            setDialog(null);
            refocus(parentPath(dialogPage.path));
            run(() => ops.remove(dialogPage.path));
          }}
          onClose={() => {
            setDialog(null);
            refocus(dialogPage.path);
          }}
        />
      )}
    </>
  );
}
