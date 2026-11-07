/**
 * The handle shown beside a block on hover (see blueprints/block-handle.md):
 * drag it to move the block, or open its menu to turn the block into another
 * type, duplicate, move, indent, outdent, or delete it.
 */
import type { TurnIntoKind } from "@quire/markdown";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";

/** Something the block menu can do to a block. */
export type BlockAction =
  | { kind: "turnInto"; to: TurnIntoKind }
  | { kind: "duplicate" | "delete" | "moveUp" | "moveDown" | "indent" | "outdent" };

/** One entry of the block menu. */
interface MenuEntry {
  label: string;
  action: BlockAction;
  /** Shortcut shown after the label. */
  keys?: string;
}

/** Block types offered under "Turn into", in menu order. */
const TURN_INTO: readonly { to: TurnIntoKind; label: string }[] = [
  { to: "text", label: "Text" },
  { to: "h1", label: "Heading 1" },
  { to: "h2", label: "Heading 2" },
  { to: "h3", label: "Heading 3" },
  { to: "bullet", label: "Bulleted list" },
  { to: "numbered", label: "Numbered list" },
  { to: "todo", label: "To-do list" },
  { to: "quote", label: "Quote" },
  { to: "code", label: "Code" },
];

/** True on macOS, where shortcuts use the Command key. */
const MAC = /Macintosh|Mac OS X/i.test(navigator.userAgent);

/** A shortcut label for this OS. */
function shortcut(keys: string): string {
  return MAC ? `⌘${keys.replace("Shift+", "⇧")}` : `Ctrl+${keys}`;
}

/**
 * The menu entries for a block: the types it can turn into (`turnInto`; empty
 * when it cannot change type), and indent and outdent for list items.
 */
function entriesFor(turnInto: readonly TurnIntoKind[], listItem: boolean): MenuEntry[][] {
  const types = TURN_INTO.filter((entry) => turnInto.includes(entry.to)).map(
    ({ to, label }): MenuEntry => ({ label, action: { kind: "turnInto", to } }),
  );
  const arrange: MenuEntry[] = [
    { label: "Duplicate", action: { kind: "duplicate" }, keys: shortcut("D") },
    { label: "Move up", action: { kind: "moveUp" }, keys: shortcut("Shift+↑") },
    { label: "Move down", action: { kind: "moveDown" }, keys: shortcut("Shift+↓") },
  ];
  if (listItem) {
    arrange.push(
      { label: "Indent", action: { kind: "indent" }, keys: "Tab" },
      { label: "Outdent", action: { kind: "outdent" }, keys: "Shift+Tab" },
    );
  }
  const remove: MenuEntry[] = [{ label: "Delete", action: { kind: "delete" } }];
  return [types, arrange, remove].filter((group) => group.length > 0);
}

/**
 * The menu itself. It takes focus, moves between items with the arrow keys,
 * and closes on Escape, Tab, a choice, or a click outside.
 */
function BlockMenu({
  groups,
  onChoose,
  onClose,
}: {
  groups: MenuEntry[][];
  onChoose: (action: BlockAction) => void;
  onClose: (refocus: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);
  useEffect(() => {
    const onPointer = (event: MouseEvent): void => {
      if (event.target instanceof Node && menu.current?.parentElement?.contains(event.target)) {
        return;
      }
      onClose(false);
    };
    document.addEventListener("mousedown", onPointer, true);
    return () => document.removeEventListener("mousedown", onPointer, true);
  }, [onClose]);

  /** Arrow keys, Home, and End move focus between items; Escape and Tab close. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.findIndex((item) => item === document.activeElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (at + 1) % items.length;
    else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      onClose(event.key === "Escape");
      return;
    } else return;
    event.preventDefault();
    items[next]?.focus();
  };

  return (
    <div ref={menu} className="block-menu" role="menu" aria-label="Block" onKeyDown={onKeyDown}>
      {groups.map((group, groupIndex) => (
        <div
          key={group[0]?.label ?? groupIndex}
          className="block-menu__group"
          role="group"
          aria-label={groupIndex === 0 && group[0]?.action.kind === "turnInto" ? "Turn into" : undefined}
        >
          {groupIndex === 0 && group[0]?.action.kind === "turnInto" && (
            <div className="block-menu__heading" aria-hidden="true">
              Turn into
            </div>
          )}
          {group.map((entry) => (
            <button
              key={entry.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`block-menu__item${entry.action.kind === "delete" ? " block-menu__item--danger" : ""}`}
              onClick={() => onChoose(entry.action)}
            >
              <span>{entry.label}</span>
              {entry.keys && <span className="block-menu__keys">{entry.keys}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The handle for block `index`. `turnInto` lists the types the block can
 * become and `listItem` adds indent and outdent. Dragging the handle calls
 * `onDragStart` and `onDragEnd`; menu choices call `onAction`.
 */
export function BlockHandle({
  turnInto,
  listItem,
  onAction,
  onDragStart,
  onDragEnd,
}: {
  turnInto: readonly TurnIntoKind[];
  listItem: boolean;
  onAction: (action: BlockAction) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  /** Start dragging the whole block, shown by its own image. */
  const startDrag = (event: DragEvent<HTMLButtonElement>): void => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "");
    const slot = event.currentTarget.closest(".block-slot");
    if (slot instanceof HTMLElement) event.dataTransfer.setDragImage(slot, 0, slot.offsetHeight / 2);
    setOpen(false);
    onDragStart();
  };

  /** Close the menu, returning focus to the handle after Escape. */
  const close = (refocus: boolean): void => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  return (
    <div
      className={`block-handle${open ? " block-handle--open" : ""}`}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        ref={button}
        type="button"
        className="block-handle__button"
        aria-label="Block actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Drag to move, click for actions"
        draggable
        onClick={() => setOpen((current) => !current)}
        onDragStart={startDrag}
        onDragEnd={onDragEnd}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
          {[2, 7, 12].flatMap((y) =>
            [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />),
          )}
        </svg>
      </button>
      {open && (
        <BlockMenu
          groups={entriesFor(turnInto, listItem)}
          onChoose={(action) => {
            setOpen(false);
            onAction(action);
          }}
          onClose={close}
        />
      )}
    </div>
  );
}
