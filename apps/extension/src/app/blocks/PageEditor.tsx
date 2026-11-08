/**
 * The editable title and body of a page (see blueprints/page-editing.md and
 * blueprints/block-keys.md). The block holding the caret is edited in place:
 * its text in a text box, its marker drawn as a bullet, number, checkbox, or
 * heading style. Every other block is shown formatted. Edits change only the
 * lines they touch.
 */
import {
  LIST_KINDS,
  applyShortcut,
  blockAtLine,
  blockLineCount,
  blockText,
  clearPrefix,
  deleteBlock,
  duplicateBlock,
  formatsAt,
  indentItem,
  inlineText,
  insertDivider,
  insertLines,
  insertLinkLine,
  insertTemplate,
  isSingleLine,
  linkAt,
  linkHref,
  listNumbers,
  mergeWithPrevious,
  moveBlock,
  moveBlockBy,
  offsetInBlock,
  pageLinkLine,
  parseDocument,
  parseImageLine,
  parseInline,
  positionInText,
  removeLink,
  replaceBlockText,
  setImage,
  setLink,
  setTitle,
  splitBlock,
  splitLine,
  tableSource,
  titleBlockIndex,
  titleText,
  toggleMark,
  toggleTodo,
  turnInto,
  unwrapCode,
  type Block,
  type CellPosition,
  type Edit,
  type LineParts,
  type MarkdownDocument,
  type Mark,
  type Selected,
  type SourcePosition,
  type TurnIntoKind,
} from "@quire/markdown";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { pageHash, type CreatedPage } from "../../shared/pages";
import { filterSlashItems, type SlashItem } from "../../shared/slash";
import { BlockHandle, type BlockAction } from "./BlockHandle";
import { BlockView, BULLETS } from "./BlockView";
import { caretPoint } from "./caretPoint";
import { FORMAT_TOOLBAR, FormatToolbar } from "./FormatToolbar";
import { ImageEditor } from "./ImageEditor";
import { SlashMenu, slashOptionId } from "./SlashMenu";
import { TableEditor } from "./TableEditor";

/** The cell of table `block` that `focus` (on one of its lines) points at. */
function focusedCell(block: Block, focus: SourcePosition): CellPosition {
  const offset = focus.line - block.line;
  return { row: offset <= 1 ? 0 : offset - 1, column: Math.max(focus.column, 0) };
}

/** The caret position for cell `cell` of the table starting on source line `start`. */
function cellFocus(start: number, cell: CellPosition): Focus {
  return { kind: "body", line: start + (cell.row === 0 ? 0 : cell.row + 1), column: cell.column };
}

/**
 * Where the caret is: in the title, or at a source position in the body. A
 * body `anchor` (a column on the same line) makes it a selection. In a table,
 * `line` is the row's source line and `column` is the cell's index in it.
 */
type Focus =
  | { kind: "title"; offset: number }
  | ({ kind: "body"; anchor?: number } & SourcePosition);

/**
 * The formatting toolbar over a selection in the block on source line `line`:
 * the selection in the block's text (after its marker), where it floats
 * relative to the block, and whether the link address form is open.
 */
interface Toolbar {
  line: number;
  start: number;
  end: number;
  left: number;
  top: number;
  linking: boolean;
}

/** Where the toolbar goes for the selection in `box`, relative to the block being edited. */
function toolbarAt(box: HTMLTextAreaElement, line: number, linking: boolean): Toolbar {
  const { selectionStart: start, selectionEnd: end } = box;
  const point = caretPoint(box, start);
  const host = box.closest(".block--editing") ?? box;
  const boxRect = box.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  return {
    line,
    start,
    end,
    left: boxRect.left - hostRect.left + point.left,
    top: boxRect.top - hostRect.top + point.top,
    linking,
  };
}

/** The style a formatting shortcut toggles, or null for other keys. */
function shortcutMark(event: KeyboardEvent<HTMLTextAreaElement>): Mark | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.shiftKey) return key === "x" || key === "s" ? "strike" : null;
  return key === "b" ? "bold" : key === "i" ? "italic" : key === "e" ? "code" : null;
}

/**
 * An open slash menu: the source line of its block, where the `/` is in the
 * block's text (after the marker), the text typed after it, and the
 * highlighted item.
 */
interface Slash {
  line: number;
  start: number;
  query: string;
  active: number;
}

/** Elements inside a formatted block that keep their own click behavior. */
const INTERACTIVE = "a, button, input, summary";
/** Image types that can be added to a page, as a file input `accept` list. */
const IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/svg+xml";

/** The image files among dropped or pasted files. */
function imageFiles(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []).filter((file) => IMAGE_TYPES.split(",").includes(file.type));
}

/** True while a drag carries files from outside the page. */
function carriesFiles(data: DataTransfer): boolean {
  return Array.from(data.types).includes("Files");
}

/**
 * A text box that grows with its content, takes focus when it appears, and
 * selects from `anchor` to `caret` (or puts the caret at `caret`) whenever
 * those or `request` change.
 */
function SourceBox({
  value,
  caret,
  anchor,
  request,
  label,
  className,
  placeholder,
  menu,
  onChange,
  onKeyDown,
  onSelect,
  onBlur,
}: {
  value: string;
  caret: number;
  anchor?: number;
  /** A new value focuses the box and sets its selection again. */
  request?: unknown;
  label: string;
  className: string;
  placeholder?: string;
  /** The open menu this box controls: its id and the highlighted option's id. */
  menu?: { id: string; active: string | undefined } | null;
  onChange: (value: string, caret: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelect?: (box: HTMLTextAreaElement) => void;
  onBlur: (event: FocusEvent<HTMLTextAreaElement>) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const latestOnSelect = useRef(onSelect);
  useLayoutEffect(() => {
    latestOnSelect.current = onSelect;
  });
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    if (document.activeElement !== element) element.focus();
    const start = Math.min(anchor ?? caret, caret);
    const end = Math.max(anchor ?? caret, caret);
    if (element.selectionStart !== start || element.selectionEnd !== end) {
      element.setSelectionRange(start, end);
    }
    if (start !== end) latestOnSelect.current?.(element);
  }, [caret, anchor, request]);
  return (
    <textarea
      ref={box}
      className={className}
      value={value}
      rows={1}
      aria-label={label}
      aria-controls={menu?.id}
      aria-activedescendant={menu?.active}
      aria-autocomplete={menu ? "list" : undefined}
      placeholder={placeholder}
      onChange={(event) =>
        onChange(event.currentTarget.value, event.currentTarget.selectionStart)
      }
      onKeyDown={onKeyDown}
      onSelect={(event) => onSelect?.(event.currentTarget)}
      onBlur={onBlur}
    />
  );
}

/** Hint shown in an empty block being edited. */
function placeholderFor(parts: LineParts | null): string | undefined {
  switch (parts?.kind) {
    case "heading":
      return `Heading ${parts.level}`;
    case "bullet":
    case "numbered":
      return "List";
    case "todo":
      return "To-do";
    case "quote":
      return "Quote";
    case "text":
      return "Type / for commands, # for a heading, or - for a list";
    default:
      return undefined;
  }
}

/** Length of the marker that starts a one-line block, 0 for other blocks. */
function prefixLength(block: Block): number {
  return isSingleLine(block) ? splitLine(blockText(block)).prefix.length : 0;
}

/**
 * The block being edited, drawn in its own type: the marker shown as a
 * bullet, number, or checkbox and the text box styled like the block.
 * Multi-line blocks (`parts` null) are edited as Markdown source.
 */
function EditingBlock({
  block,
  parts,
  number,
  onToggle,
  children,
}: {
  block: Block;
  parts: LineParts | null;
  number: number | undefined;
  onToggle: () => void;
  children: ReactNode;
}) {
  const base = "block block--editing";
  if (parts === null) return <div className={`${base} block--source-edit`}>{children}</div>;
  if (parts.kind === "heading") {
    return <div className={`${base} block--heading block--h${parts.level}`}>{children}</div>;
  }
  if (parts.kind === "quote") return <div className={`${base} block--quote`}>{children}</div>;
  if (!LIST_KINDS.has(parts.kind)) return <div className={base}>{children}</div>;
  const depth = "depth" in block ? block.depth : 0;
  let marker: ReactNode = BULLETS[depth % BULLETS.length];
  if (parts.kind === "numbered") {
    marker = `${number ?? (block.type === "numbered" ? block.number : 1)}.`;
  } else if (parts.kind === "todo") {
    marker = (
      <input
        type="checkbox"
        className="block__checkbox"
        checked={parts.checked}
        onMouseDown={(event) => event.preventDefault()}
        onChange={onToggle}
        aria-label={parts.checked ? "Done" : "Not done"}
      />
    );
  }
  const done = parts.kind === "todo" && parts.checked ? " block--done" : "";
  return (
    <div
      className={`${base} block--list block--${parts.kind}${done}`}
      style={{ "--depth": depth } as CSSProperties}
    >
      <span className="block__marker">{marker}</span>
      <div className="block__body">{children}</div>
    </div>
  );
}

/**
 * The slash menu after `value` was typed into a block with the caret at
 * `caret`: `open` kept with a new query, a new menu when a `/` was just typed
 * at the start or after a space, or null. A space, a query nothing matches,
 * or the caret moving before the `/` closes it.
 */
function nextSlash(
  open: Slash | null,
  line: number,
  previous: string,
  value: string,
  caret: number,
): Slash | null {
  if (open) {
    const query = value.slice(open.start + 1, caret);
    const valid =
      caret > open.start &&
      value[open.start] === "/" &&
      !/\s/.test(query) &&
      filterSlashItems(query).length > 0;
    if (!valid) return null;
    return { ...open, query, active: query === open.query ? open.active : 0 };
  }
  const before = value[caret - 2];
  const typedSlash =
    value[caret - 1] === "/" &&
    value.length === previous.length + 1 &&
    (before === undefined || /\s/.test(before));
  return typedSlash ? { line, start: caret - 1, query: "", active: 0 } : null;
}

/**
 * Report a title typed in this editor once, when the editor has lost focus or
 * closes. `edited` holds the title before the first keystroke, or null when
 * nothing was typed. An emptied or unchanged title is not reported.
 */
function commitTitle(
  latest: { current: { title: string; onTitleCommit?: (title: string, from: string) => void } },
  edited: { current: string | null },
): void {
  const from = edited.current;
  if (from === null) return;
  edited.current = null;
  const title = latest.current.title.trim();
  if (title !== "" && title !== from.trim()) latest.current.onTitleCommit?.(title, from);
}

/** Block types that are list items, which the block menu can indent and outdent. */
const LIST_TYPES: ReadonlySet<Block["type"]> = new Set(["bullet", "numbered", "todo"]);

/** Every type a one-line block can be turned into from its menu. */
const ALL_TURN_INTO: readonly TurnIntoKind[] = [
  "text",
  "h1",
  "h2",
  "h3",
  "bullet",
  "numbered",
  "todo",
  "quote",
  "code",
];

/**
 * The types block `block` can be turned into: any type for text, headings,
 * quotes, and list items, plain text for code, and none for the rest.
 */
function turnIntoKinds(block: Block): readonly TurnIntoKind[] {
  switch (block.type) {
    case "text":
    case "heading":
    case "quote":
    case "bullet":
    case "numbered":
    case "todo":
      return ALL_TURN_INTO;
    case "code":
      return ["text"];
    default:
      return [];
  }
}

/** The edit a block menu choice makes to block `index`, or null when it changes nothing. */
function runAction(
  document: MarkdownDocument,
  index: number,
  block: Block,
  action: BlockAction,
): Edit | null {
  switch (action.kind) {
    case "turnInto":
      return block.type === "code"
        ? unwrapCode(document, index)
        : turnInto(document, index, blockText(block), 0, action.to);
    case "duplicate":
      return duplicateBlock(document, index);
    case "delete":
      return deleteBlock(document, index);
    case "moveUp":
      return moveBlockBy(document, index, -1);
    case "moveDown":
      return moveBlockBy(document, index, 1);
    case "indent":
      return indentItem(document, index, 1);
    case "outdent":
      return indentItem(document, index, -1);
  }
}

/** Describe a failed request for an inline message. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Render the title and blocks of `markdown`, calling `onChange` with the new
 * source after every edit. `onCreatePage` makes a sub-page of this page for
 * the `/page` command, and `onTransform` rewrites the latest source once it
 * exists. `children` (notices about the page) go under the title.
 */
export function PageEditor({
  markdown,
  fallbackTitle,
  pagePath,
  childTitles,
  onChange,
  onCreatePage,
  onTransform,
  onTitleCommit,
  onAiWrite,
  onAddImage,
  children,
}: {
  markdown: MarkdownDocument;
  fallbackTitle: string;
  pagePath: string;
  childTitles: ReadonlyMap<string, string>;
  onChange: (source: string) => void;
  onCreatePage: (title: string) => Promise<CreatedPage>;
  onTransform: (change: (source: string) => string) => boolean;
  /** Called with the new and the earlier title when focus leaves a title that was edited. */
  onTitleCommit?: (title: string, from: string) => void;
  /** Opens Write with AI for source line `line`, where `/ai` was typed. */
  onAiWrite?: (line: number) => void;
  /** Saves an image file into the page's assets and answers its image line. */
  onAddImage?: (file: File) => Promise<string>;
  children?: ReactNode;
}) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [slash, setSlash] = useState<Slash | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toolbar, setToolbar] = useState<Toolbar | null>(null);
  const [drag, setDrag] = useState<{ from: number; before: number | null } | null>(null);
  const [fileDrop, setFileDrop] = useState<number | null>(null);
  const menuId = useId();
  const blocks = markdown.blocks;
  const titleIndex = titleBlockIndex(blocks);
  const titleBlock = blocks[titleIndex];
  const title = titleText(markdown);
  const shownTitle =
    titleBlock?.type === "heading" ? inlineText(parseInline(titleBlock.text)) : fallbackTitle;
  const numbers = listNumbers(blocks);
  const editing = focus?.kind === "body" ? blockAtLine(blocks, focus.line) : -1;
  const bodyCount = blocks.length - (titleIndex >= 0 ? 1 : 0);
  const firstMovable = Math.max(blocks[0]?.type === "frontMatter" ? 1 : 0, titleIndex + 1);
  const lineCount = blocks.reduce((total, block) => total + blockLineCount(block), 0);
  const idle = focus === null;
  const latestTitle = useRef({ title, onTitleCommit });
  const titleEdited = useRef<string | null>(null);
  useLayoutEffect(() => {
    latestTitle.current = { title, onTitleCommit };
  });
  useEffect(() => {
    if (idle) commitTitle(latestTitle, titleEdited);
  }, [idle]);
  useEffect(() => () => commitTitle(latestTitle, titleEdited), []);

  /** Apply an edit and put the caret where it belongs afterwards. */
  const apply = (source: string, caret: Focus | null): void => {
    onChange(source);
    setFocus(caret);
    setToolbar(null);
  };

  /**
   * Close the text box `mine` unless the caret has already moved elsewhere or
   * focus went to the formatting toolbar.
   */
  const release = (mine: Focus) => (event?: FocusEvent<HTMLElement>) => {
    const next = event?.relatedTarget;
    if (next instanceof Element && next.closest(`.${FORMAT_TOOLBAR}`)) return;
    setSlash(null);
    setToolbar(null);
    setFocus((current) => (current === mine ? null : current));
  };

  /**
   * Show the toolbar for a selection in block `block`'s text box, or hide it
   * for a caret. Multi-line blocks and the open slash menu get no toolbar.
   */
  const select = (block: Block, parts: LineParts | null) => (box: HTMLTextAreaElement) => {
    if (parts === null || box.selectionStart === box.selectionEnd || slash !== null) {
      if (toolbar !== null && !toolbar.linking) setToolbar(null);
      return;
    }
    const next = toolbarAt(box, block.line, false);
    const same =
      toolbar !== null &&
      !toolbar.linking &&
      (["line", "start", "end", "left", "top"] as const).every((key) => toolbar[key] === next[key]);
    if (!same) setToolbar(next);
  };

  /**
   * Replace block `index`'s text (after marker `parts`) with `result` and
   * select what it marks as selected.
   */
  const applySelected = (index: number, block: Block, parts: LineParts, result: Selected): void => {
    const shift = parts.prefix.length;
    apply(replaceBlockText(markdown, index, parts.prefix + result.text), {
      kind: "body",
      line: block.line,
      column: shift + result.end,
      anchor: shift + result.start,
    });
    setToolbar(
      toolbar && result.start !== result.end
        ? { ...toolbar, start: result.start, end: result.end, linking: false }
        : null,
    );
  };

  /** Turn `mark` on or off for the selection from `start` to `end` in block `index`. */
  const format = (
    index: number,
    block: Block,
    parts: LineParts,
    start: number,
    end: number,
    mark: Mark,
  ): void => {
    applySelected(index, block, parts, toggleMark(parts.content, start, end, mark));
  };

  /**
   * Finish the link form: link the toolbar's selection to `address`, or
   * remove the link when the address is empty.
   */
  const applyLink = (
    index: number,
    block: Block,
    parts: LineParts,
    address: string | null,
  ): void => {
    if (!toolbar) return;
    const href = address === null ? null : linkHref(address);
    const { start, end } = toolbar;
    const result =
      href === null
        ? removeLink(parts.content, start, end)
        : setLink(parts.content, start, end, href);
    applySelected(index, block, parts, result);
  };

  /** Close the link form and give the text box back its selection. */
  const cancelLink = (block: Block, parts: LineParts): void => {
    if (!toolbar) return;
    const shift = parts.prefix.length;
    setToolbar({ ...toolbar, linking: false });
    setFocus({
      kind: "body",
      line: block.line,
      column: shift + toolbar.end,
      anchor: shift + toolbar.start,
    });
  };

  /** The block one step before or after `index`, skipping the title, or -1. */
  const neighbor = (index: number, step: 1 | -1): number => {
    let at = index + step;
    if (at === titleIndex) at += step;
    return at >= 0 && at < blocks.length ? at : -1;
  };

  /** Put the caret at the start of a new empty line at the end of the page. */
  const writeAtEnd = (): void => {
    const last = blocks.at(-1);
    if (last && last !== titleBlock && blockText(last).trim() === "") {
      setFocus({ kind: "body", line: last.line, column: 0 });
      return;
    }
    apply(insertLines(markdown, blocks.length, ""), { kind: "body", line: lineCount, column: 0 });
  };

  /** Keys in the title: Enter and Down move into the body. */
  const onTitleKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key !== "Enter" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const first = neighbor(titleIndex >= 0 ? titleIndex : -1, 1);
    const block = blocks[first];
    if (block) setFocus({ kind: "body", line: block.line, column: 0 });
    else if (event.key === "Enter") writeAtEnd();
  };

  /**
   * Text typed into block `index`, shown without its marker (`parts`). The
   * marker is put back in front; `[] ` and `" ` shortcuts and a typed `---`
   * change the block's type.
   */
  const typeInto = (
    index: number,
    block: Block,
    parts: LineParts | null,
    value: string,
    caret: number,
  ): void => {
    if (parts?.kind === "text" && value === "---" && blockText(block) === "--") {
      const edit = insertDivider(markdown, index);
      apply(edit.source, { kind: "body", ...edit.caret });
      return;
    }
    const prefix = parts?.prefix ?? "";
    const line = prefix + value;
    const next = (parts && applyShortcut(line, prefix.length + caret)) ?? line;
    const column = prefix.length + caret + next.length - line.length;
    const source = replaceBlockText(markdown, index, next);
    const menu = slash?.line === block.line ? slash : null;
    setSlash(
      parts && next === line ? nextSlash(menu, block.line, parts.content, value, caret) : null,
    );
    const becomesTitle =
      (titleIndex < 0 || index < titleIndex) &&
      next.startsWith("# ") &&
      !next.includes("\n") &&
      next.slice(2).trim() !== "";
    if (becomesTitle) {
      apply(source, { kind: "title", offset: Math.max(column - 2, 0) });
      return;
    }
    apply(source, { kind: "body", ...positionInText(block.line, next, column) });
  };

  /** Run a block menu choice on block `index`. */
  const act = (index: number, block: Block, action: BlockAction): void => {
    const edit = runAction(markdown, index, block, action);
    if (edit) onChange(edit.source);
  };

  /**
   * Move (`step` -1 or 1) or duplicate (`step` 0) block `index`, which is
   * being edited with its text box selection at `start`, and keep the caret
   * at the same place in the moved block or the copy.
   */
  const arrangeEditing = (index: number, block: Block, offset: number, step: -1 | 0 | 1): void => {
    const edit =
      step === 0 ? duplicateBlock(markdown, index) : moveBlockBy(markdown, index, step);
    if (!edit) return;
    const at = positionInText(block.line, blockText(block), offset);
    apply(edit.source, {
      kind: "body",
      line: edit.caret.line + at.line - block.line,
      column: at.column,
    });
  };

  /**
   * Add a sub-page for `/page` typed into block `index`, whose text without
   * the command is `text`: create the page, put a link to it on that line
   * (or after it, when the line has words), and open it.
   */
  const addSubPage = (index: number, block: Block, text: string, offset: number): void => {
    apply(replaceBlockText(markdown, index, text), {
      kind: "body",
      ...positionInText(block.line, text, offset),
    });
    setPageError(null);
    onCreatePage("Untitled")
      .then((created) => {
        const link = pageLinkLine(created.title, created.folder);
        const linked = onTransform((source) => {
          const document = parseDocument(source);
          const at = blockAtLine(document.blocks, block.line);
          return insertLinkLine(document, at < 0 ? document.blocks.length : at, link).source;
        });
        if (linked) window.location.hash = pageHash(created.path);
      })
      .catch((error: unknown) =>
        setPageError(`Quire couldn't add the sub-page: ${messageOf(error)}`),
      );
  };

  /**
   * Save image `files` into the page's assets and put their image lines on
   * source line `line` when it is empty, otherwise after its block (`where`
   * "after"), or before the block at `line` (`where` "before").
   */
  const addImages = (files: readonly File[], line: number, where: "after" | "before"): void => {
    if (!onAddImage || files.length === 0) return;
    setPageError(null);
    Promise.all(files.map((file) => onAddImage(file)))
      .then((lines) => {
        const text = lines.join("\n");
        onTransform((source) => {
          const document = parseDocument(source);
          const at = blockAtLine(document.blocks, line);
          if (where === "after") {
            return insertLinkLine(document, at < 0 ? document.blocks.length : at, text).source;
          }
          return insertLines(document, at < 0 ? document.blocks.length : at, text);
        });
      })
      .catch((error: unknown) => setPageError(`Quire couldn't add the image: ${messageOf(error)}`));
  };

  /**
   * The block index a drag over the page would drop before: the block under
   * the pointer, or the one after it when the pointer is over its lower half,
   * never above the title. Null when the pointer is not over a block.
   */
  const dropIndex = (event: DragEvent<HTMLElement>): number | null => {
    const slot = event.target instanceof Element ? event.target.closest("[data-index]") : null;
    if (!(slot instanceof HTMLElement)) return null;
    const at = Number(slot.dataset.index);
    const rect = slot.getBoundingClientRect();
    return Math.max(event.clientY < rect.top + rect.height / 2 ? at : at + 1, firstMovable);
  };

  /**
   * Add an image for `/image` typed into block `index`, whose text without
   * the command is `text`: ask for a file, then put the image on that line
   * (or after it, when the line has words).
   */
  const pickImage = (index: number, block: Block, text: string, offset: number): void => {
    apply(replaceBlockText(markdown, index, text), {
      kind: "body",
      ...positionInText(block.line, text, offset),
    });
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMAGE_TYPES;
    input.multiple = true;
    input.addEventListener("change", () => {
      addImages(Array.from(input.files ?? []), block.line, "after");
    });
    input.click();
  };

  /**
   * Ask for a file to replace the image on source line `line` with: save it
   * into the page's assets and point the image at it, keeping its size,
   * alignment, and caption.
   */
  const replaceImage = (line: number): void => {
    if (!onAddImage) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMAGE_TYPES;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      setPageError(null);
      onAddImage(file)
        .then((added) => {
          const image = parseImageLine(added);
          if (!image) return;
          onTransform((source) => {
            const document = parseDocument(source);
            const at = blockAtLine(document.blocks, line);
            return setImage(document, at, { src: image.src, alt: image.alt }) ?? source;
          });
        })
        .catch((error: unknown) =>
          setPageError(`Quire couldn't replace the image: ${messageOf(error)}`),
        );
    });
    input.click();
  };

  /**
   * Delete image block `index` from the keyboard or its menu and put the
   * caret at the end of the block before it, or in the title.
   */
  const removeImage = (index: number): void => {
    const edit = deleteBlock(markdown, index);
    if (!edit) return;
    if (titleIndex >= 0 && index - 1 === titleIndex) {
      apply(edit.source, { kind: "title", offset: title.length });
    }
    else apply(edit.source, index > firstMovable ? { kind: "body", ...edit.caret } : null);
  };

  /**
   * Run slash command `item` in block `index` (`parts` is its marker and
   * text): the `/` and the query typed after it are removed first.
   */
  const choose = (index: number, block: Block, parts: LineParts, item: SlashItem): void => {
    if (!slash) return;
    const end = slash.start + 1 + slash.query.length;
    const content = parts.content.slice(0, slash.start) + parts.content.slice(end);
    const text = parts.prefix + content;
    const offset = parts.prefix.length + slash.start;
    setSlash(null);
    const command = item.command;
    if (command === "page") {
      addSubPage(index, block, text, offset);
      return;
    }
    if (command === "image") {
      pickImage(index, block, text, offset);
      return;
    }
    if (command === "ai") {
      apply(replaceBlockText(markdown, index, text), {
        kind: "body",
        ...positionInText(block.line, text, offset),
      });
      onAiWrite?.(block.line);
      return;
    }
    if (command === "table" || command === "callout" || command === "toggle") {
      const inserted = insertTemplate(markdown, index, text, command);
      if (!inserted) return;
      apply(
        inserted.source,
        command === "table"
          ? { kind: "body", line: inserted.caret.line, column: 0 }
          : { kind: "body", ...inserted.caret },
      );
      return;
    }
    const edit = turnInto(markdown, index, text, offset, command);
    if (!edit) return;
    const next = parseDocument(edit.source);
    const titled = titleBlockIndex(next.blocks);
    if (titled >= 0 && titled === blockAtLine(next.blocks, edit.caret.line)) {
      apply(edit.source, { kind: "title", offset: Math.max(edit.caret.column - 2, 0) });
      return;
    }
    apply(edit.source, { kind: "body", ...edit.caret });
  };

  /**
   * Keys while the slash menu of block `index` is open: Up and Down move the
   * highlight, Enter and Tab choose, and Escape closes the menu. Returns true
   * when the key was used.
   */
  const onMenuKey = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    index: number,
    block: Block,
    parts: LineParts,
    items: readonly SlashItem[],
  ): boolean => {
    if (!slash || items.length === 0) return false;
    const active = Math.min(slash.active, items.length - 1);
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSlash({ ...slash, active: (active + step + items.length) % items.length });
    } else if ((event.key === "Enter" || event.key === "Tab") && plain) {
      const item = items[active];
      if (item) choose(index, block, parts, item);
    } else if (event.key === "Escape") {
      setSlash(null);
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  };

  /**
   * Keys in a block: Enter splits, Backspace removes the block's type and
   * then joins, Tab and Shift+Tab nest list items, Ctrl+Enter checks a to-do,
   * and Up and Down move between blocks. Offsets in the text box count from
   * the end of the block's marker.
   */
  const onBlockKey =
    (index: number, block: Block, parts: LineParts | null, items: readonly SlashItem[]) =>
    (event: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (event.nativeEvent.isComposing) return;
      if (parts && onMenuKey(event, index, block, parts, items)) return;
      const { selectionStart: start, selectionEnd: end, value } = event.currentTarget;
      const collapsed = start === end;
      const prefix = parts?.prefix ?? "";
      const mark = parts ? shortcutMark(event) : null;
      const command = (event.ctrlKey || event.metaKey) && !event.altKey;
      const linkKey = command && !event.shiftKey && event.key.toLowerCase() === "k";
      const moveKey =
        command && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown");
      if (moveKey) {
        event.preventDefault();
        arrangeEditing(index, block, prefix.length + start, event.key === "ArrowUp" ? -1 : 1);
      } else if (command && !event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        arrangeEditing(index, block, prefix.length + start, 0);
      } else if (parts && mark) {
        event.preventDefault();
        format(index, block, parts, start, end, mark);
      } else if (parts && linkKey && (!collapsed || linkAt(value, start, end) !== null)) {
        event.preventDefault();
        setToolbar(toolbarAt(event.currentTarget, block.line, true));
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && parts?.kind === "todo") {
        event.preventDefault();
        onChange(toggleTodo(markdown, index));
      } else if (event.key === "Enter" && !event.shiftKey && isSingleLine(block)) {
        event.preventDefault();
        const text = prefix + value.slice(0, start) + value.slice(end);
        const edit = splitBlock(markdown, index, text, prefix.length + start);
        apply(edit.source, { kind: "body", ...edit.caret });
      } else if (event.key === "Tab" && parts !== null) {
        event.preventDefault();
        const edit = indentItem(markdown, index, event.shiftKey ? -1 : 1);
        if (!edit) return;
        const caret = { line: edit.caret.line, column: edit.caret.column + start };
        apply(edit.source, { kind: "body", ...caret });
      } else if (event.key === "Backspace" && collapsed && start === 0 && prefix !== "") {
        event.preventDefault();
        const edit = clearPrefix(markdown, index);
        apply(edit.source, { kind: "body", ...edit.caret });
      } else if (event.key === "Backspace" && collapsed && start === 0) {
        const edit = mergeWithPrevious(markdown, index);
        if (!edit) return;
        event.preventDefault();
        apply(
          edit.source,
          index - 1 === titleIndex
            ? { kind: "title", offset: title.length }
            : { kind: "body", ...edit.caret },
        );
      } else if (event.key === "ArrowUp" && collapsed && !value.slice(0, start).includes("\n")) {
        event.preventDefault();
        const previous = blocks[neighbor(index, -1)];
        if (!previous) {
          setFocus({ kind: "title", offset: Math.min(start, title.length) });
          return;
        }
        const rows = blockText(previous).split("\n");
        const column = previous.type === "table" ? 0 : prefixLength(previous) + start;
        setFocus({ kind: "body", line: previous.line + rows.length - 1, column });
      } else if (event.key === "ArrowDown" && collapsed && !value.slice(end).includes("\n")) {
        const next = blocks[neighbor(index, 1)];
        if (!next) return;
        event.preventDefault();
        const column = start - (value.lastIndexOf("\n", start - 1) + 1);
        setFocus({
          kind: "body",
          line: next.line,
          column: next.type === "table" ? 0 : prefixLength(next) + column,
        });
      } else if (event.key === "Escape") {
        event.preventDefault();
        setToolbar(null);
        setFocus(null);
      }
    };

  /**
   * Leave table or image `index` with the arrow keys: up to the end of the
   * block before it (or the title), down to the start of the block after it.
   */
  const leaveBlock = (index: number, step: -1 | 1): void => {
    const target = blocks[neighbor(index, step)];
    if (!target) {
      if (step === -1) setFocus({ kind: "title", offset: title.length });
      return;
    }
    const text = blockText(target);
    if (target.type === "table") {
      const last = target.line + text.split("\n").length - 1;
      setFocus({ kind: "body", line: step === -1 ? last : target.line, column: 0 });
    } else if (step === 1) {
      setFocus({ kind: "body", line: target.line, column: prefixLength(target) });
    } else {
      setFocus({ kind: "body", ...positionInText(target.line, text, text.length) });
    }
  };

  /** Start editing a formatted block at its end, unless a link or control was clicked. */
  const activate = (block: Block) => (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
    event.preventDefault();
    const text = blockText(block);
    setFocus({ kind: "body", ...positionInText(block.line, text, text.length) });
  };

  return (
    <>
      {focus?.kind === "title" ? (
        <SourceBox
          className="page__title page__title-input"
          value={title}
          caret={focus.offset}
          label="Page title"
          placeholder={fallbackTitle}
          onChange={(value, caret) => {
            titleEdited.current ??= title;
            apply(setTitle(markdown, value), { kind: "title", offset: caret });
          }}
          onKeyDown={onTitleKey}
          onBlur={release(focus)}
        />
      ) : (
        <h1
          id="page-title"
          className="page__title"
          tabIndex={0}
          onFocus={() => setFocus({ kind: "title", offset: title.length })}
        >
          {shownTitle}
        </h1>
      )}
      {children}
      <div
        className="blocks"
        onDragOver={(event) => {
          const files = drag === null && onAddImage !== undefined && carriesFiles(event.dataTransfer);
          if (drag === null && !files) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = files ? "copy" : "move";
          const before = dropIndex(event);
          if (before === null) return;
          if (drag === null) {
            if (before !== fileDrop) setFileDrop(before);
          } else if (before !== drag.before) {
            setDrag({ ...drag, before });
          }
        }}
        onDragLeave={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node && event.currentTarget.contains(next))) setFileDrop(null);
        }}
        onDrop={(event) => {
          if (drag === null) {
            const files = imageFiles(event.dataTransfer);
            const before = dropIndex(event) ?? fileDrop;
            setFileDrop(null);
            if (files.length === 0) return;
            event.preventDefault();
            const target = before === null ? undefined : blocks[before];
            const end = blocks.at(-1);
            const line = target ? target.line : end ? end.line + blockLineCount(end) : 0;
            addImages(files, line, "before");
            return;
          }
          event.preventDefault();
          const edit = drag.before === null ? null : moveBlock(markdown, drag.from, drag.before);
          setDrag(null);
          if (edit) onChange(edit.source);
        }}
        onPaste={(event) => {
          const files = imageFiles(event.clipboardData);
          if (files.length === 0 || focus?.kind !== "body") return;
          event.preventDefault();
          addImages(files, focus.line, "after");
        }}
      >
        {blocks.map((block, index) => {
          if (index === titleIndex) return null;
          const key = `${block.line}`;
          const dropAt = drag?.before ?? fileDrop;
          const slotClass = `block-slot${dropAt === index ? " block-slot--drop-before" : ""}${dropAt === blocks.length && index === blocks.length - 1 ? " block-slot--drop-after" : ""}${drag?.from === index ? " block-slot--dragging" : ""}`;
          if (block.type === "image") {
            const here: Focus = { kind: "body", line: block.line, column: 0 };
            return (
              <div key={key} className={slotClass} data-index={index}>
                <BlockHandle
                  turnInto={[]}
                  listItem={false}
                  onAction={(action) => act(index, block, action)}
                  onDragStart={() => setDrag({ from: index, before: null })}
                  onDragEnd={() => setDrag(null)}
                />
                <ImageEditor
                  block={block}
                  pagePath={pagePath}
                  selected={index === editing && focus?.kind === "body"}
                  onSelect={() => {
                    setSlash(null);
                    setToolbar(null);
                    if (index !== editing) setFocus(here);
                  }}
                  onChange={(changes) => {
                    const source = setImage(markdown, index, changes);
                    if (source !== null) apply(source, here);
                  }}
                  onEnter={() =>
                    apply(insertLines(markdown, index + 1, ""), {
                      kind: "body",
                      line: block.line + 1,
                      column: 0,
                    })
                  }
                  onDelete={() => removeImage(index)}
                  onReplace={onAddImage ? () => replaceImage(block.line) : undefined}
                  onExit={(step) => leaveBlock(index, step)}
                  onLeave={() =>
                    setFocus((current) =>
                      current?.kind === "body" && current.line === block.line ? null : current,
                    )
                  }
                />
              </div>
            );
          }
          if (block.type === "table") {
            const cell = index === editing && focus?.kind === "body" ? focusedCell(block, focus) : null;
            const mine = focus;
            return (
              <div key={key} className={slotClass} data-index={index}>
                <BlockHandle
                  turnInto={[]}
                  listItem={false}
                  onAction={(action) => act(index, block, action)}
                  onDragStart={() => setDrag({ from: index, before: null })}
                  onDragEnd={() => setDrag(null)}
                />
                <TableEditor
                  block={block}
                  pagePath={pagePath}
                  cell={cell}
                  onSelect={(next) => {
                    setSlash(null);
                    setToolbar(null);
                    setFocus(cellFocus(block.line, next));
                  }}
                  onEdit={(table, next) =>
                    apply(
                      replaceBlockText(markdown, index, tableSource(block.source, table)),
                      next ? cellFocus(block.line, next) : null,
                    )
                  }
                  onExit={(step) => leaveBlock(index, step)}
                  onLeave={() => setFocus((current) => (current === mine ? null : current))}
                />
              </div>
            );
          }
          if (index === editing && focus?.kind === "body") {
            const text = blockText(block);
            const parts = isSingleLine(block) ? splitLine(text) : null;
            const shift = parts?.prefix.length ?? 0;
            const menu = parts && slash?.line === block.line ? slash : null;
            const items = menu ? filterSlashItems(menu.query) : [];
            const activeIndex = Math.max(Math.min(menu?.active ?? 0, items.length - 1), 0);
            const active = items[activeIndex];
            const anchor =
              focus.anchor === undefined
                ? undefined
                : Math.max(offsetInBlock(block, { line: focus.line, column: focus.anchor }) - shift, 0);
            const bar = parts && !menu && toolbar?.line === block.line ? toolbar : null;
            return (
              <EditingBlock
                key={key}
                block={block}
                parts={parts}
                number={numbers.get(index)}
                onToggle={() => onChange(toggleTodo(markdown, index))}
              >
                <SourceBox
                  className="block__source"
                  value={parts ? parts.content : text}
                  caret={Math.max(offsetInBlock(block, focus) - shift, 0)}
                  anchor={anchor}
                  request={focus}
                  label="Edit block"
                  placeholder={placeholderFor(parts)}
                  menu={
                    items.length > 0
                      ? { id: menuId, active: active ? slashOptionId(menuId, active) : undefined }
                      : null
                  }
                  onChange={(value, caret) => typeInto(index, block, parts, value, caret)}
                  onKeyDown={onBlockKey(index, block, parts, items)}
                  onSelect={select(block, parts)}
                  onBlur={release(focus)}
                />
                {bar && parts && (
                  <FormatToolbar
                    left={bar.left}
                    top={bar.top}
                    formats={formatsAt(parts.content, bar.start, bar.end)}
                    linking={bar.linking}
                    onMark={(mark) => format(index, block, parts, bar.start, bar.end, mark)}
                    onStartLink={() => setToolbar({ ...bar, linking: true })}
                    onLink={(address) => applyLink(index, block, parts, address)}
                    onUnlink={() => applyLink(index, block, parts, null)}
                    onCancelLink={() => cancelLink(block, parts)}
                    onLeave={() => {
                      setToolbar(null);
                      setFocus(null);
                    }}
                  />
                )}
                {menu && parts && items.length > 0 && (
                  <SlashMenu
                    id={menuId}
                    items={items}
                    active={activeIndex}
                    onChoose={(item) => choose(index, block, parts, item)}
                    onHighlight={(at) => setSlash({ ...menu, active: at })}
                  />
                )}
              </EditingBlock>
            );
          }
          return (
            <div
              key={key}
              className={slotClass}
              data-index={index}
              onMouseDown={activate(block)}
            >
              {block.type !== "frontMatter" && (
                <BlockHandle
                  turnInto={turnIntoKinds(block)}
                  listItem={LIST_TYPES.has(block.type)}
                  onAction={(action) => act(index, block, action)}
                  onDragStart={() => setDrag({ from: index, before: null })}
                  onDragEnd={() => setDrag(null)}
                />
              )}
              <BlockView
                block={block}
                number={numbers.get(index)}
                pagePath={pagePath}
                childTitles={childTitles}
                onToggle={() => onChange(toggleTodo(markdown, index))}
              />
            </div>
          );
        })}
      </div>
      {pageError !== null && (
        <p className="page__inline-error" role="alert">
          {pageError}
        </p>
      )}
      <div
        className="page__tail"
        onMouseDown={(event) => {
          event.preventDefault();
          writeAtEnd();
        }}
      >
        {bodyCount === 0 && (
          <p className="page__placeholder">
            Click here, or press Enter in the title, to start writing.
          </p>
        )}
      </div>
    </>
  );
}
