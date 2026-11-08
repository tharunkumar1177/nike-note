/**
 * An image edited like Notion's (see blueprints/rich-blocks.md). The picture
 * always shows, and clicking it selects it. Handles on its sides resize it,
 * and a toolbar on hover aligns it left, center, or right, adds a caption,
 * and opens a menu for alt text, replacing, downloading, going back to the
 * picture's own size, and deleting. Every change goes back to the page as an
 * image line through `onChange`.
 */
import { MAX_IMAGE_WIDTH, type Block, type ImageAlign, type ImageParts } from "@quire/markdown";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { AlignIcon, CaptionIcon, MoreIcon } from "../../shared/icons";
import { menuBelow, PopoverMenu, type MenuItem, type MenuPlace } from "./PopoverMenu";
import { ImageContent, useImageSource, type ImageSource } from "./RichBlocks";

/** Narrowest width a drag or key makes an image, in CSS pixels. */
const MIN_WIDTH = 48;
/** How far one arrow key press on a resize handle changes the width. */
const KEY_STEP = 16;
/** How far one Shift+arrow key press on a resize handle changes the width. */
const KEY_STEP_LARGE = 64;

/** The alignment buttons, in toolbar order. */
const ALIGNS: readonly { align: ImageAlign; label: string }[] = [
  { align: "left", label: "Align left" },
  { align: "center", label: "Align center" },
  { align: "right", label: "Align right" },
];

/** Which resize handle: the one on the image's left or right edge. */
type Side = "left" | "right";

/** A resize drag in progress. */
interface Resize {
  pointer: number;
  side: Side;
  /** Pointer position and image width when the drag started. */
  x: number;
  width: number;
  /** Widest the image can be shown on the page. */
  max: number;
}

/** `value` kept between `low` and `high`. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * How much wider the image gets when its `side` handle moves right by `dx`
 * pixels. A centered image grows on both sides, so it changes twice as much.
 */
function growth(side: Side, align: ImageAlign, dx: number): number {
  const outward = side === "right" ? dx : -dx;
  return align === "center" ? outward * 2 : outward;
}

/** The file name a download of image `src` is saved under. */
function downloadName(src: string): string {
  const last = src.split(/[?#]/)[0]?.split("/").at(-1) ?? "";
  try {
    return decodeURIComponent(last) || "image";
  } catch {
    return last || "image";
  }
}

/** Save or open the picture at `source`. */
function download(source: ImageSource, src: string): void {
  if (source.status !== "ready") return;
  const link = document.createElement("a");
  link.href = source.url;
  link.download = downloadName(src);
  if (source.web) {
    link.target = "_blank";
    link.rel = "noreferrer";
  }
  link.click();
}

/**
 * The alt text form, shown in the top layer under the menu button. Enter or
 * Done saves; Escape or a click outside closes it unchanged.
 */
function AltTextForm({
  place,
  alt,
  onSave,
  onClose,
}: {
  place: MenuPlace;
  alt: string;
  onSave: (alt: string) => void;
  onClose: () => void;
}) {
  const element = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const latestClose = useRef(onClose);
  const [draft, setDraft] = useState(alt);
  const id = useId();
  useLayoutEffect(() => {
    latestClose.current = onClose;
  });
  useLayoutEffect(() => {
    const popover = element.current;
    if (!popover) return;
    popover.showPopover();
    input.current?.focus();
    input.current?.select();
    const onToggle = (event: Event): void => {
      if ((event as ToggleEvent).newState === "closed") latestClose.current();
    };
    popover.addEventListener("toggle", onToggle);
    return () => {
      popover.removeEventListener("toggle", onToggle);
      if (popover.matches(":popover-open")) popover.hidePopover();
    };
  }, []);

  return (
    <form
      ref={element}
      popover="auto"
      className="block-menu popover-menu image-editor__alt"
      aria-label="Alt text"
      style={{ top: place.top, left: place.left }}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft.trim());
        element.current?.hidePopover();
      }}
    >
      <label className="image-editor__alt-label" htmlFor={id}>
        Alt text
      </label>
      <input
        ref={input}
        id={id}
        className="format-toolbar__input image-editor__alt-input"
        value={draft}
        placeholder="Describe the image"
        onChange={(event) => setDraft(event.currentTarget.value)}
      />
      <p className="image-editor__alt-hint">
        Read aloud by screen readers and shown if the image can&apos;t load.
      </p>
      <button type="submit" className="format-toolbar__text-button image-editor__alt-done">
        Done
      </button>
    </form>
  );
}

/**
 * Render image `block` for editing. `selected` is true while the page caret
 * is on it. `onSelect` selects it, `onChange` saves new image parts,
 * `onEnter` starts a line below it, `onDelete` removes it, `onReplace` picks
 * another file for it, `onExit` moves the caret up (-1) or down (1), and
 * `onLeave` reports that focus left it.
 */
export function ImageEditor({
  block,
  pagePath,
  selected,
  onSelect,
  onChange,
  onEnter,
  onDelete,
  onReplace,
  onExit,
  onLeave,
}: {
  block: Extract<Block, { type: "image" }>;
  pagePath: string;
  selected: boolean;
  onSelect: () => void;
  onChange: (changes: Partial<ImageParts>) => void;
  onEnter: () => void;
  onDelete: () => void;
  onReplace?: () => void;
  onExit: (step: -1 | 1) => void;
  onLeave: () => void;
}) {
  const source = useImageSource(block, pagePath);
  const root = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLInputElement>(null);
  const resize = useRef<Resize | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [captioning, setCaptioning] = useState(false);
  const [menu, setMenu] = useState<MenuPlace | null>(null);
  const [altForm, setAltForm] = useState<MenuPlace | null>(null);
  const [room, setRoom] = useState(MAX_IMAGE_WIDTH);
  const [shown, setShown] = useState<number | null>(null);
  const ready = source.status === "ready";
  const width = dragWidth ?? block.width;

  useEffect(() => {
    const element = root.current;
    const picture = frame.current;
    if (!element || !picture) return;
    const observer = new ResizeObserver(() => {
      setRoom(Math.min(element.clientWidth, MAX_IMAGE_WIDTH));
      setShown(Math.round(picture.getBoundingClientRect().width));
    });
    observer.observe(element);
    observer.observe(picture);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = root.current;
    if (selected && element && !element.contains(document.activeElement)) element.focus();
  }, [selected]);

  useLayoutEffect(() => {
    if (captioning) caption.current?.focus();
  }, [captioning]);

  /** The image's shown width right now. */
  const currentWidth = (): number =>
    frame.current?.querySelector("img")?.getBoundingClientRect().width ?? block.width ?? MIN_WIDTH;

  /** Give focus back to the image itself, keeping it selected. */
  const refocus = (): void => {
    root.current?.focus();
  };

  /** Select the image when it, not one of its controls, is pressed. */
  const onPress = (event: MouseEvent<HTMLElement>): void => {
    if (event.target instanceof Element && event.target.closest("button, input, [role=separator]")) {
      return;
    }
    event.preventDefault();
    onSelect();
    refocus();
  };

  /** Keys on the selected image: Enter, Backspace and Delete, the arrows, and Escape. */
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget || event.nativeEvent.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onEnter();
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

  /** Focus left: stop captioning and report it, unless focus stayed in the image or its menus. */
  const onBlur = (event: FocusEvent<HTMLElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && root.current?.contains(next)) return;
    setCaptioning(false);
    onLeave();
  };

  /** Start dragging the `side` handle. */
  const onResizeStart = (side: Side) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = currentWidth();
    resize.current = { pointer: event.pointerId, side, x: event.clientX, width: start, max: room };
    setDragWidth(Math.round(start));
    onSelect();
  };

  /** Follow the pointer while a handle is dragged. */
  const onResizeMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = resize.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    const next = drag.width + growth(drag.side, block.align, event.clientX - drag.x);
    setDragWidth(Math.round(clamp(next, Math.min(MIN_WIDTH, drag.width), drag.max)));
  };

  /** Finish a drag and save the width it ended at. */
  const onResizeEnd = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = resize.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    resize.current = null;
    if (dragWidth !== null && dragWidth !== Math.round(drag.width)) onChange({ width: dragWidth });
    setDragWidth(null);
    refocus();
  };

  /** Drop a drag the browser cancelled, keeping the saved width. */
  const onResizeCancel = (event: PointerEvent<HTMLDivElement>): void => {
    if (resize.current?.pointer !== event.pointerId) return;
    resize.current = null;
    setDragWidth(null);
  };

  /** Arrow keys on a focused handle widen or narrow the image, outwards from that side. */
  const onResizeKey = (side: Side) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const outward = (event.key === "ArrowRight") === (side === "right") ? step : -step;
    const start = currentWidth();
    const next = Math.round(clamp(start + outward, Math.min(MIN_WIDTH, start), room));
    if (next !== Math.round(start) || block.width === null) onChange({ width: next });
  };

  /** One resize handle, on side `side` of the picture. */
  const handle = (side: Side) => (
    <div
      className={`image-editor__resize image-editor__resize--${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize image from the ${side} edge`}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={room}
      aria-valuenow={width ?? shown ?? undefined}
      aria-valuetext={width === null ? "Original size" : `${width} pixels wide`}
      tabIndex={0}
      onPointerDown={onResizeStart(side)}
      onPointerMove={onResizeMove}
      onPointerUp={onResizeEnd}
      onPointerCancel={onResizeCancel}
      onKeyDown={onResizeKey(side)}
    />
  );

  /** The entries of the image menu. */
  const menuItems: (MenuItem | "separator")[] = [
    {
      label: "Alt text…",
      run: () => {
        const button = root.current?.querySelector<HTMLElement>(".image-editor__more");
        if (!button) return;
        onSelect();
        setAltForm(menuBelow(button));
      },
    },
    ...(onReplace ? [{ label: "Replace image…", run: onReplace }] : []),
    { label: "Original size", disabled: block.width === null, run: () => onChange({ width: null }) },
    { label: "Download", disabled: !ready, run: () => download(source, block.src) },
    "separator",
    { label: "Delete image", danger: true, run: onDelete },
  ];

  const classes = [
    "block",
    "block--image",
    `block--image-${block.align}`,
    "image-editor",
    selected ? "image-editor--selected" : "",
    dragWidth !== null ? "image-editor--resizing" : "",
    menu !== null || altForm !== null || captioning ? "image-editor--active" : "",
  ];

  return (
    <figure
      ref={root}
      className={classes.filter(Boolean).join(" ")}
      tabIndex={-1}
      aria-label={block.alt ? `Image: ${block.alt}` : "Image"}
      onMouseDown={onPress}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <div ref={frame} className={`image-editor__frame${ready ? "" : " image-editor__frame--note"}`}>
        <ImageContent block={block} source={source} width={width} />
        {ready && handle("left")}
        {ready && handle("right")}
        <div className="image-editor__toolbar" role="toolbar" aria-label="Image">
          {ready &&
            ALIGNS.map(({ align, label }) => (
              <button
                key={align}
                type="button"
                className="image-editor__button"
                aria-label={label}
                title={label}
                aria-pressed={block.align === align}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onChange({ align })}
              >
                <AlignIcon align={align} />
              </button>
            ))}
          {ready && (
            <button
              type="button"
              className="image-editor__button"
              aria-label="Caption"
              title="Caption"
              aria-pressed={captioning}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect();
                setCaptioning(true);
              }}
            >
              <CaptionIcon />
            </button>
          )}
          <button
            type="button"
            className="image-editor__button image-editor__more"
            aria-label="Image actions"
            title="More actions"
            aria-haspopup="menu"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              onSelect();
              setMenu(menuBelow(event.currentTarget));
            }}
          >
            <MoreIcon />
          </button>
        </div>
      </div>
      {captioning ? (
        <input
          ref={caption}
          className="image-editor__caption-input"
          value={block.title}
          placeholder="Write a caption"
          aria-label="Caption"
          style={width === null ? undefined : { width }}
          onChange={(event) => onChange({ title: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== "Escape") return;
            event.preventDefault();
            setCaptioning(false);
            refocus();
          }}
        />
      ) : (
        block.title && (
          <figcaption
            className="block__caption image-editor__caption"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect();
              setCaptioning(true);
            }}
          >
            {block.title}
          </figcaption>
        )
      )}
      {menu && (
        <PopoverMenu
          place={menu}
          label="Image actions"
          items={menuItems}
          onClose={() => {
            setMenu(null);
            const active = document.activeElement;
            if (active === null || active === document.body || active.closest('[role="menu"]')) {
              refocus();
            }
          }}
        />
      )}
      {altForm && (
        <AltTextForm
          place={altForm}
          alt={block.alt}
          onSave={(alt) => onChange({ alt })}
          onClose={() => {
            setAltForm(null);
            refocus();
          }}
        />
      )}
    </figure>
  );
}
