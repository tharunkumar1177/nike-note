/**
 * A small action menu shown in the top layer (see blueprints/rich-blocks.md),
 * so a scrolled or clipped block cannot hide it. Table rows and columns and
 * images open their menus with it.
 */
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

/** One entry of a menu. */
export interface MenuItem {
  label: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
}

/** Where a menu is shown, in viewport pixels. */
export interface MenuPlace {
  top: number;
  left: number;
}

/** The place for a menu that opens under element `anchor`, lined up with its left edge. */
export function menuBelow(anchor: HTMLElement): MenuPlace {
  const rect = anchor.getBoundingClientRect();
  return { top: rect.bottom + 4, left: rect.left };
}

/**
 * A menu at `place` that takes focus, moves with the arrow keys, and closes
 * on Escape, a click outside, or a choice, calling `onClose` each time.
 */
export function PopoverMenu({
  place,
  label,
  items,
  onClose,
}: {
  place: MenuPlace;
  label: string;
  items: readonly (MenuItem | "separator")[];
  onClose: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const latestClose = useRef(onClose);
  useLayoutEffect(() => {
    latestClose.current = onClose;
  });
  useLayoutEffect(() => {
    const popover = element.current;
    if (!popover) return;
    popover.showPopover();
    popover.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')?.focus();
    const onToggle = (event: Event): void => {
      if ((event as ToggleEvent).newState === "closed") latestClose.current();
    };
    popover.addEventListener("toggle", onToggle);
    return () => {
      popover.removeEventListener("toggle", onToggle);
      if (popover.matches(":popover-open")) popover.hidePopover();
    };
  }, []);

  /** Arrow keys, Home, and End move between the items that can be chosen. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const buttons = [
      ...(element.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ??
        []),
    ];
    const at = buttons.findIndex((button) => button === document.activeElement);
    const next: Record<string, number> = {
      ArrowDown: (at + 1) % buttons.length,
      ArrowUp: (at - 1 + buttons.length) % buttons.length,
      Home: 0,
      End: buttons.length - 1,
    };
    const target = next[event.key];
    if (target === undefined) return;
    event.preventDefault();
    buttons[target]?.focus();
  };

  return (
    <div
      ref={element}
      popover="auto"
      className="block-menu popover-menu"
      role="menu"
      aria-label={label}
      style={{ top: place.top, left: place.left }}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.map((item, at) =>
        item === "separator" ? (
          <div key={`separator-${at}`} className="popover-menu__separator" role="separator" />
        ) : (
          <button
            key={item.label}
            type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={item.checked}
            tabIndex={-1}
            disabled={item.disabled}
            className={`block-menu__item${item.danger ? " block-menu__item--danger" : ""}`}
            onClick={() => {
              element.current?.hidePopover();
              item.run();
            }}
          >
            <span>{item.label}</span>
            {item.checked && <span className="block-menu__keys">✓</span>}
          </button>
        ),
      )}
    </div>
  );
}
