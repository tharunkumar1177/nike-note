/**
 * The page tree's actions (see blueprints/page-operations.md): the menu on a
 * sidebar row, the dialog that picks where to move a page, and the
 * confirmation before deleting one.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { flattenPages, isWithin, pageTrail, parentPath, type PageNode } from "../shared/pages";

/** Something the row menu can do. */
export type PageAction = "create" | "rename" | "move" | "delete";

/** One entry of the row menu. */
interface MenuEntry {
  action: PageAction;
  label: string;
  keys?: string;
}

/**
 * Attribute naming the page whose menu a button opens; pressing that button
 * while the menu is open toggles it instead of closing it as an outside click.
 */
export const MENU_ANCHOR = "data-menu-for";

/** Every row menu entry, in menu order. */
const ENTRIES: readonly MenuEntry[] = [
  { action: "create", label: "Add sub-page" },
  { action: "rename", label: "Rename", keys: "F2" },
  { action: "move", label: "Move to…" },
  { action: "delete", label: "Delete", keys: "Del" },
];

/**
 * The menu for page `path`, shown at `left`, `top` (viewport pixels). The
 * home page can only get sub-pages and a new title.
 */
export function PageMenu({
  path,
  left,
  top,
  onChoose,
  onClose,
}: {
  path: string;
  left: number;
  top: number;
  onChoose: (action: PageAction) => void;
  /** Close the menu; `byKey` is true for Escape and Tab, which return focus to the row. */
  onClose: (byKey: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const entries = ENTRIES.filter(
    (entry) => path !== "" || entry.action === "create" || entry.action === "rename",
  );

  useLayoutEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);
  useEffect(() => {
    const onPointer = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (menu.current?.contains(target) || target.closest(`[${MENU_ANCHOR}="${CSS.escape(path)}"]`)) return;
      onClose(false);
    };
    document.addEventListener("mousedown", onPointer, true);
    return () => document.removeEventListener("mousedown", onPointer, true);
  }, [onClose]);

  /** Arrow keys, Home, and End move between items; Escape and Tab close. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      onClose(true);
      return;
    }
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.findIndex((item) => item === document.activeElement);
    const next: Record<string, number> = {
      ArrowDown: (at + 1) % items.length,
      ArrowUp: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    const target = next[event.key];
    if (target === undefined) return;
    event.preventDefault();
    items[target]?.focus();
  };

  return (
    <div
      ref={menu}
      className="page-menu"
      role="menu"
      aria-label="Page"
      style={{ left, top }}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      {entries.map((entry) => (
        <button
          key={entry.action}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={`page-menu__item${entry.action === "delete" ? " page-menu__item--danger" : ""}`}
          onClick={() => onChoose(entry.action)}
        >
          <span>{entry.label}</span>
          {entry.keys && <span className="page-menu__keys">{entry.keys}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * A modal dialog that is open while it is mounted. Escape or the backdrop
 * calls `onClose`.
 */
function Modal({
  labelledBy,
  className,
  onClose,
  children,
}: {
  labelledBy: string;
  className: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal__body">{children}</div>
    </dialog>
  );
}

/**
 * Pick the page to move `page` into: any page except itself, its sub-pages,
 * and its current parent, narrowed by typing.
 */
export function MoveDialog({
  root,
  page,
  onMove,
  onClose,
}: {
  root: PageNode;
  page: PageNode;
  onMove: (parent: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const titleId = useId();
  const listId = useId();
  const current = parentPath(page.path);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const options = flattenPages(root).filter(
    (node) =>
      !isWithin(node.path, page.path) &&
      node.path !== current &&
      words.every((word) => node.title.toLowerCase().includes(word)),
  );
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (index: number): string => `${listId}-${index}`;

  /** Move through the options with the arrow keys; Enter moves the page. */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + options.length) % Math.max(options.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = options[activeIndex];
      if (chosen) onMove(chosen.path);
    }
  };

  return (
    <Modal labelledBy={titleId} className="move-dialog" onClose={onClose}>
      <h2 id={titleId} className="modal__title">
        Move “{page.title}” to
      </h2>
      <input
        className="modal__input"
        role="combobox"
        aria-label="Find a page"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={options.length > 0 ? optionId(activeIndex) : undefined}
        placeholder="Find a page"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} className="move-dialog__list" role="listbox" aria-label="Pages">
        {options.map((node, index) => {
          const trail = pageTrail(root, node.path)
            .slice(0, -1)
            .map((step) => step.title)
            .join(" / ");
          return (
            <li
              key={node.path}
              id={optionId(index)}
              className={`move-dialog__option${index === activeIndex ? " move-dialog__option--active" : ""}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => onMove(node.path)}
            >
              <span>{node.title}</span>
              {trail && <span className="move-dialog__trail">{trail}</span>}
            </li>
          );
        })}
        {options.length === 0 && <li className="move-dialog__empty">No matching pages</li>}
      </ul>
      <div className="modal__actions">
        <button type="button" className="q-button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/**
 * Confirm deleting `page`, which also deletes every sub-page.
 */
export function DeleteDialog({
  page,
  onDelete,
  onClose,
}: {
  page: PageNode;
  onDelete: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const below = flattenPages(page).length - 1;
  return (
    <Modal labelledBy={titleId} className="delete-dialog" onClose={onClose}>
      <h2 id={titleId} className="modal__title">
        Delete “{page.title}”?
      </h2>
      <p className="modal__text">
        {below === 0
          ? "The page and its files are deleted from the notes folder."
          : `The page, its ${below === 1 ? "sub-page" : `${below} sub-pages`}, and their files are deleted from the notes folder.`}{" "}
        Versions that were already synced stay in the Git history.
      </p>
      <div className="modal__actions">
        <button type="button" className="q-button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="q-button q-button--danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </Modal>
  );
}
