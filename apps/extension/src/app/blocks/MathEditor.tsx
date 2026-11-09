/**
 * A block equation edited like Notion's (see blueprints/rich-blocks.md). The
 * rendered formula always shows, and an empty equation shows a hint.
 * Clicking it, or Enter while it is selected, opens an editor under it whose
 * TeX redraws the formula as it is typed; Enter or Done closes the editor.
 * Every change goes back to the page through `onChange`.
 */
import type { Block } from "@quire/markdown";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { useRenderedMath } from "../math/mathStore";
import { EmptyEquation, MathFormula } from "./MathFormula";

/** Width range of the TeX editor, in CSS pixels. */
const FORM_MIN_WIDTH = 320;
const FORM_MAX_WIDTH = 560;
/** Room the editor needs below an equation before it opens above it instead. */
const FORM_ROOM = 220;
/** Space between the editor and the viewport's edges. */
const EDGE = 8;
/** Most lines the TeX box grows to before it scrolls. */
const MAX_ROWS = 12;

/** Where the TeX editor is shown, in viewport pixels: under or over the equation. */
interface FormPlace {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
}

/**
 * The place for the TeX editor of the equation shown in `element`: centered
 * under it, or over it when the viewport has no room below.
 */
function formPlace(element: HTMLElement): FormPlace {
  const rect = element.getBoundingClientRect();
  const width = Math.min(
    Math.max(rect.width, FORM_MIN_WIDTH),
    FORM_MAX_WIDTH,
    window.innerWidth - 2 * EDGE,
  );
  const centered = rect.left + (rect.width - width) / 2;
  const left = Math.min(Math.max(centered, EDGE), window.innerWidth - width - EDGE);
  const above = rect.bottom + FORM_ROOM > window.innerHeight && rect.top > FORM_ROOM;
  return above
    ? { bottom: window.innerHeight - rect.top + 6, left, width }
    : { top: rect.bottom + 6, left, width };
}

/**
 * The TeX editor, shown in the top layer at `place`. Every keystroke goes to
 * `onChange`. Enter, Escape, and Done call `onFinish` and close it; any close,
 * including a click outside, calls `onClosed`. `error` is why the TeX cannot
 * be shown, or null.
 */
function EquationForm({
  place,
  tex,
  error,
  onChange,
  onFinish,
  onClosed,
}: {
  place: FormPlace;
  tex: string;
  error: string | null;
  onChange: (tex: string) => void;
  onFinish: () => void;
  onClosed: () => void;
}) {
  const element = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const latestClosed = useRef(onClosed);
  const messageId = useId();
  useLayoutEffect(() => {
    latestClosed.current = onClosed;
  });
  useLayoutEffect(() => {
    const popover = element.current;
    if (!popover) return;
    popover.showPopover();
    const input = box.current;
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    const onToggle = (event: Event): void => {
      if ((event as ToggleEvent).newState === "closed") latestClosed.current();
    };
    popover.addEventListener("toggle", onToggle);
    return () => {
      popover.removeEventListener("toggle", onToggle);
      if (popover.matches(":popover-open")) popover.hidePopover();
    };
  }, []);

  /** Close the editor, keeping what was typed. */
  const finish = (): void => {
    onFinish();
    element.current?.hidePopover();
  };

  /** Enter and Escape close the editor; Shift+Enter adds a line to the TeX. */
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const enter = event.key === "Enter" && !event.shiftKey && !event.altKey;
    if (!enter && event.key !== "Escape") return;
    event.preventDefault();
    finish();
  };

  return (
    <form
      ref={element}
      popover="auto"
      className="block-menu popover-menu math-editor__form"
      aria-label="Edit equation"
      style={place}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        finish();
      }}
    >
      <textarea
        ref={box}
        className="math-editor__input"
        value={tex}
        rows={Math.min(Math.max(tex.split("\n").length, 1), MAX_ROWS)}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        placeholder="E = mc^2"
        aria-label="TeX"
        aria-invalid={error !== null}
        aria-describedby={messageId}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <div className="math-editor__form-row">
        <p
          id={messageId}
          className={`math-editor__message${error === null ? "" : " math-editor__message--error"}`}
          aria-live="polite"
        >
          {error ?? "Shift+Enter adds a line"}
        </p>
        <button type="submit" className="format-toolbar__text-button math-editor__done">
          Done
        </button>
      </div>
    </form>
  );
}

/**
 * Render equation `block` for editing. `selected` is true while the page
 * caret is on it and `open` while its TeX editor should show. `onSelect`
 * selects it, `onOpen` and `onClose` open and close the editor, `onChange`
 * saves new TeX, `onDelete` removes it, `onExit` moves the caret up (-1) or
 * down (1), and `onLeave` reports that focus left it.
 */
export function MathEditor({
  block,
  selected,
  open,
  onSelect,
  onOpen,
  onClose,
  onChange,
  onDelete,
  onExit,
  onLeave,
}: {
  block: Extract<Block, { type: "math" }>;
  selected: boolean;
  open: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onClose: () => void;
  onChange: (tex: string) => void;
  onDelete: () => void;
  onExit: (step: -1 | 1) => void;
  onLeave: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<FormPlace | null>(null);
  const result = useRenderedMath(block.tex, true);
  const empty = block.tex.trim() === "";
  const editing = selected && open;

  useEffect(() => {
    const element = root.current;
    if (!editing || !element) return;
    const update = (): void => setPlace(formPlace(element));
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [editing]);

  useLayoutEffect(() => {
    const element = root.current;
    if (selected && !open && element && !element.contains(document.activeElement)) {
      element.focus();
    }
  }, [selected, open]);

  /** Give focus back to the equation itself, keeping it selected. */
  const refocus = (): void => {
    root.current?.focus();
  };

  /** Select the equation and open its editor when it is pressed. */
  const onPress = (event: MouseEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    onSelect();
    onOpen();
    refocus();
  };

  /** Keys on the selected equation: Enter, Backspace and Delete, the arrows, and Escape. */
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget || event.nativeEvent.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onOpen();
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      onDelete();
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      onExit(-1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      onExit(1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  /** Focus left the equation and its editor: close the editor and report it. */
  const onBlur = (event: FocusEvent<HTMLElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && root.current?.contains(next)) return;
    setPlace(null);
    onLeave();
  };

  const classes = [
    "block",
    "block--math",
    "math-editor",
    selected ? "math-editor--selected" : "",
    editing ? "math-editor--editing" : "",
    empty ? "math-editor--empty" : "",
  ];

  return (
    <figure
      ref={root}
      className={classes.filter(Boolean).join(" ")}
      tabIndex={-1}
      aria-label={empty ? "Empty equation" : "Equation"}
      onMouseDown={onPress}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {empty ? <EmptyEquation /> : <MathFormula tex={block.tex} display />}
      {editing && place && (
        <EquationForm
          place={place}
          tex={block.tex}
          error={result.status === "error" && !empty ? result.message : null}
          onChange={onChange}
          onFinish={refocus}
          onClosed={() => {
            setPlace(null);
            onClose();
          }}
        />
      )}
    </figure>
  );
}
