/**
 * Sidebar page tree: the root page first, then its sub-pages as an expandable,
 * keyboard-navigable ARIA tree.
 */
import { useRef, useState, type KeyboardEvent } from "react";

import { ChevronIcon, HomeIcon, PageIcon } from "../shared/icons";
import { isAncestor, type PageNode } from "../shared/pages";
import { openPage } from "./route";

/** One visible row of the tree. */
interface Row {
  node: PageNode;
  depth: number;
  /** Path of the row's parent row; null for top-level rows. */
  parent: string | null;
}

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

/**
 * Render the page tree with `selected` highlighted and its ancestors expanded.
 */
export function PageTreeNav({ root, selected }: { root: PageNode; selected: string }) {
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [focused, setFocused] = useState<string | null>(null);
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

  /**
   * Arrow keys move and expand, Enter and Space open, Home and End jump.
   */
  function onKeyDown(event: KeyboardEvent, index: number): void {
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
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <ul className="tree" role="tree" aria-label="Pages">
      {rows.map((row, index) => {
        const { node, depth } = row;
        const isRoot = node.path === "";
        const expandable = !isRoot && node.children.length > 0;
        const open = expandable && isOpen(node.path);
        const current = node.path === selected;
        return (
          <li
            key={node.path}
            ref={(element) => {
              if (element) items.current.set(node.path, element);
              else items.current.delete(node.path);
            }}
            className={current ? "tree__item tree__item--selected" : "tree__item"}
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={expandable ? open : undefined}
            aria-selected={current}
            tabIndex={node.path === tabStop ? 0 : -1}
            onClick={() => openPage(node.path)}
            onFocus={() => setFocused(node.path)}
            onKeyDown={(event) => onKeyDown(event, index)}
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
            <span className="tree__title">{node.title}</span>
          </li>
        );
      })}
    </ul>
  );
}
