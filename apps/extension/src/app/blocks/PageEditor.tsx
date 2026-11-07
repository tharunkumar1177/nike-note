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
  indentItem,
  inlineText,
  insertDivider,
  insertLines,
  insertLinkLine,
  isSingleLine,
  listNumbers,
  mergeWithPrevious,
  offsetInBlock,
  pageLinkLine,
  parseDocument,
  parseInline,
  positionInText,
  replaceBlockText,
  setTitle,
  splitBlock,
  splitLine,
  titleBlockIndex,
  titleText,
  toggleTodo,
  turnInto,
  type Block,
  type LineParts,
  type MarkdownDocument,
  type SourcePosition,
} from "@quire/markdown";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { pageHash, type CreatedPage } from "../../shared/pages";
import { filterSlashItems, type SlashItem } from "../../shared/slash";
import { BlockView, BULLETS } from "./BlockView";
import { SlashMenu, slashOptionId } from "./SlashMenu";

/** Where the caret is: in the title, or at a source position in the body. */
type Focus = { kind: "title"; offset: number } | ({ kind: "body" } & SourcePosition);

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

/**
 * A text box that grows with its content, takes focus when it appears, and
 * moves the caret to `caret` whenever that changes.
 */
function SourceBox({
  value,
  caret,
  label,
  className,
  placeholder,
  menu,
  onChange,
  onKeyDown,
  onBlur,
}: {
  value: string;
  caret: number;
  label: string;
  className: string;
  placeholder?: string;
  /** The open menu this box controls: its id and the highlighted option's id. */
  menu?: { id: string; active: string | undefined } | null;
  onChange: (value: string, caret: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    if (document.activeElement !== element) element.focus();
    if (element.selectionStart !== caret || element.selectionEnd !== caret) {
      element.setSelectionRange(caret, caret);
    }
  }, [caret]);
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
  children,
}: {
  markdown: MarkdownDocument;
  fallbackTitle: string;
  pagePath: string;
  childTitles: ReadonlyMap<string, string>;
  onChange: (source: string) => void;
  onCreatePage: (title: string) => Promise<CreatedPage>;
  onTransform: (change: (source: string) => string) => boolean;
  children?: ReactNode;
}) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [slash, setSlash] = useState<Slash | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
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
  const lineCount = blocks.reduce((total, block) => total + blockLineCount(block), 0);

  /** Apply an edit and put the caret where it belongs afterwards. */
  const apply = (source: string, caret: Focus | null): void => {
    onChange(source);
    setFocus(caret);
  };

  /** Close the text box `mine` unless the caret has already moved elsewhere. */
  const release = (mine: Focus) => () => {
    setSlash(null);
    setFocus((current) => (current === mine ? null : current));
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
      .catch((error: unknown) => setPageError(messageOf(error)));
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
    if (item.command === "page") {
      addSubPage(index, block, text, offset);
      return;
    }
    const edit = turnInto(markdown, index, text, offset, item.command);
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
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && parts?.kind === "todo") {
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
        const column = prefixLength(previous) + start;
        setFocus({ kind: "body", line: previous.line + rows.length - 1, column });
      } else if (event.key === "ArrowDown" && collapsed && !value.slice(end).includes("\n")) {
        const next = blocks[neighbor(index, 1)];
        if (!next) return;
        event.preventDefault();
        const column = start - (value.lastIndexOf("\n", start - 1) + 1);
        setFocus({ kind: "body", line: next.line, column: prefixLength(next) + column });
      } else if (event.key === "Escape") {
        event.preventDefault();
        setFocus(null);
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
          onChange={(value, caret) =>
            apply(setTitle(markdown, value), { kind: "title", offset: caret })
          }
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
      <div className="blocks">
        {blocks.map((block, index) => {
          if (index === titleIndex) return null;
          const key = `${block.line}`;
          if (index === editing && focus?.kind === "body") {
            const text = blockText(block);
            const parts = isSingleLine(block) ? splitLine(text) : null;
            const shift = parts?.prefix.length ?? 0;
            const menu = parts && slash?.line === block.line ? slash : null;
            const items = menu ? filterSlashItems(menu.query) : [];
            const activeIndex = Math.max(Math.min(menu?.active ?? 0, items.length - 1), 0);
            const active = items[activeIndex];
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
                  label="Edit block"
                  placeholder={placeholderFor(parts)}
                  menu={
                    items.length > 0
                      ? { id: menuId, active: active ? slashOptionId(menuId, active) : undefined }
                      : null
                  }
                  onChange={(value, caret) => typeInto(index, block, parts, value, caret)}
                  onKeyDown={onBlockKey(index, block, parts, items)}
                  onBlur={release(focus)}
                />
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
            <div key={key} className="block-slot" onMouseDown={activate(block)}>
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
          Quire couldn&apos;t add the sub-page: {pageError}
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
