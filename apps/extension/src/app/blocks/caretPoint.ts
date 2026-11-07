/**
 * Where a character offset of a text box sits on screen, measured with a
 * hidden copy of the box that has the same font, width, and wrapping, so a
 * toolbar can float above a selection.
 */

/** Style properties that decide where text wraps inside the box. */
const LAYOUT_PROPERTIES = [
  "box-sizing",
  "width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-style",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "letter-spacing",
  "word-spacing",
  "line-height",
  "text-transform",
  "text-indent",
  "tab-size",
] as const;

/** A point in CSS pixels relative to the top-left corner of the text box. */
export interface BoxPoint {
  left: number;
  top: number;
}

/** The top-left corner of the character at `offset` in `box`, relative to the box. */
export function caretPoint(box: HTMLTextAreaElement, offset: number): BoxPoint {
  const style = getComputedStyle(box);
  const mirror = document.createElement("div");
  for (const property of LAYOUT_PROPERTIES) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  mirror.style.position = "absolute";
  mirror.style.top = "0";
  mirror.style.left = "-10000px";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.textContent = box.value.slice(0, offset);
  const marker = document.createElement("span");
  marker.textContent = box.value.slice(offset) || ".";
  mirror.append(marker);
  document.body.append(mirror);
  const point = {
    left: marker.offsetLeft - box.scrollLeft,
    top: marker.offsetTop - box.scrollTop,
  };
  mirror.remove();
  return point;
}
