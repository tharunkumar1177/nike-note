/**
 * The list of slash commands shown under the block being edited (see
 * blueprints/slash-menu.md). Focus stays in the block's text box: the box
 * moves the highlight with the arrow keys, and a click picks an item without
 * taking focus.
 */
import { useLayoutEffect, useRef } from "react";

import type { SlashItem } from "../../shared/slash";

/** The element id of item `item` in menu `menuId`, for `aria-activedescendant`. */
export function slashOptionId(menuId: string, item: SlashItem): string {
  return `${menuId}-${item.command}`;
}

/**
 * Render `items` with item `active` highlighted. `onChoose` runs on click and
 * `onHighlight` when the pointer moves over an item.
 */
export function SlashMenu({
  id,
  items,
  active,
  onChoose,
  onHighlight,
}: {
  id: string;
  items: readonly SlashItem[];
  active: number;
  onChoose: (item: SlashItem) => void;
  onHighlight: (index: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, items]);
  return (
    <div ref={list} id={id} className="slash-menu" role="listbox" aria-label="Blocks">
      {items.map((item, index) => (
        <div
          key={item.command}
          id={slashOptionId(id, item)}
          role="option"
          aria-selected={index === active}
          className={`slash-menu__item${index === active ? " slash-menu__item--active" : ""}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onChoose(item);
          }}
          onMouseMove={() => {
            if (index !== active) onHighlight(index);
          }}
        >
          <span className="slash-menu__label">{item.label}</span>
          <span className="slash-menu__hint">{item.hint}</span>
        </div>
      ))}
    </div>
  );
}
