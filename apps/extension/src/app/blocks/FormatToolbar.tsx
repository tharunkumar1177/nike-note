/**
 * The toolbar that floats above selected text in the block being edited (see
 * blueprints/inline-formatting.md): bold, italic, strikethrough, inline code,
 * inline equation, and link, each showing whether the selection already has it. Focus stays in
 * the block's text box except while a link address is typed.
 */
import type { Formats, Mark } from "@quire/markdown";
import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

/** Class name of the toolbar, used to keep the editor open while it has focus. */
export const FORMAT_TOOLBAR = "format-toolbar";

/** True on macOS, where shortcuts use the Command key. */
const MAC = /Macintosh|Mac OS X/i.test(navigator.userAgent);

/** A shortcut label for this OS, for example `Ctrl+B` or `⌘B`. */
function shortcut(keys: string): string {
  return MAC ? `⌘${keys.replace("Shift+", "⇧")}` : `Ctrl+${keys}`;
}

/** The style buttons, in toolbar order. */
const MARK_BUTTONS: readonly { mark: Mark; label: string; keys: string; face: string }[] = [
  { mark: "bold", label: "Bold", keys: "B", face: "B" },
  { mark: "italic", label: "Italic", keys: "I", face: "I" },
  { mark: "strike", label: "Strikethrough", keys: "Shift+X", face: "S" },
  { mark: "code", label: "Code", keys: "E", face: "</>" },
  { mark: "math", label: "Equation", keys: "Shift+E", face: "√x" },
];

/**
 * The link address form. Enter applies, Escape goes back to the text, and an
 * empty address removes an existing link.
 */
function LinkForm({
  initial,
  canRemove,
  onSubmit,
  onRemove,
  onCancel,
  onLeave,
}: {
  initial: string;
  canRemove: boolean;
  onSubmit: (address: string) => void;
  onRemove: () => void;
  onCancel: () => void;
  onLeave: () => void;
}) {
  const [address, setAddress] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  /** Enter applies the address and Escape returns to the text without changing the link. */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit(address);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  /** Leaving the toolbar for anything but the block's text box closes the editor. */
  const onBlur = (event: FocusEvent<HTMLInputElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Element && (next.closest(`.${FORMAT_TOOLBAR}`) || next.closest(".block--editing"))) {
      return;
    }
    onLeave();
  };

  return (
    <form
      className="format-toolbar__link"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(address);
      }}
    >
      <input
        ref={input}
        className="format-toolbar__input"
        type="text"
        value={address}
        placeholder="Paste or type a link"
        aria-label="Link address"
        spellCheck={false}
        onChange={(event) => setAddress(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      <button type="submit" className="format-toolbar__text-button">
        Apply
      </button>
      {canRemove && (
        <button
          type="button"
          className="format-toolbar__text-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRemove}
        >
          Remove
        </button>
      )}
    </form>
  );
}

/**
 * Render the toolbar at `left`/`top` (the top-left of the selection, relative
 * to the block). `formats` marks the buttons that are on; `linking` shows the
 * link address form instead of the buttons.
 */
export function FormatToolbar({
  left,
  top,
  formats,
  linking,
  onMark,
  onStartLink,
  onLink,
  onUnlink,
  onCancelLink,
  onLeave,
}: {
  left: number;
  top: number;
  formats: Formats;
  linking: boolean;
  onMark: (mark: Mark) => void;
  onStartLink: () => void;
  onLink: (address: string) => void;
  onUnlink: () => void;
  onCancelLink: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      className={FORMAT_TOOLBAR}
      role="toolbar"
      aria-label="Format"
      style={{ left: Math.max(left, 0), top }}
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
    >
      {linking ? (
        <LinkForm
          initial={formats.link?.href ?? ""}
          canRemove={formats.link?.bracketed ?? false}
          onSubmit={onLink}
          onRemove={onUnlink}
          onCancel={onCancelLink}
          onLeave={onLeave}
        />
      ) : (
        <>
          {MARK_BUTTONS.map(({ mark, label, keys, face }) => (
            <button
              key={mark}
              type="button"
              className={`format-toolbar__button format-toolbar__button--${mark}`}
              aria-label={label}
              aria-pressed={formats.marks.has(mark)}
              title={`${label} (${shortcut(keys)})`}
              disabled={formats.inCode && !formats.marks.has(mark)}
              onClick={() => onMark(mark)}
            >
              {face}
            </button>
          ))}
          <span className="format-toolbar__divider" aria-hidden="true" />
          <button
            type="button"
            className="format-toolbar__text-button"
            aria-pressed={formats.link !== null}
            title={`Link (${shortcut("K")})`}
            disabled={formats.inCode}
            onClick={onStartLink}
          >
            Link
          </button>
        </>
      )}
    </div>
  );
}
