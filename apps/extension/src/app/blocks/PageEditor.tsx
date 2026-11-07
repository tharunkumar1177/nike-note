/**
 * The editable title and body of a page (see blueprints/page-editing.md). The
 * block holding the caret shows its Markdown source in a text box; every
 * other block is shown formatted. Edits change only the lines they touch.
 */
import {
  blockAtLine,
  blockLineCount,
  blockText,
  inlineText,
  insertLines,
  isSingleLine,
  listNumbers,
  mergeWithPrevious,
  offsetInBlock,
  parseInline,
  positionInText,
  replaceBlockText,
  setTitle,
  splitBlock,
  titleBlockIndex,
  titleText,
  toggleTodo,
  type Block,
  type MarkdownDocument,
  type SourcePosition,
} from "@quire/markdown";
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { BlockView } from "./BlockView";

/** Where the caret is: in the title, or at a source position in the body. */
type Focus = { kind: "title"; offset: number } | ({ kind: "body" } & SourcePosition);

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
  onChange,
  onKeyDown,
  onBlur,
}: {
  value: string;
  caret: number;
  label: string;
  className: string;
  placeholder?: string;
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
      placeholder={placeholder}
      onChange={(event) =>
        onChange(event.currentTarget.value, event.currentTarget.selectionStart)
      }
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />
  );
}

/** Extra classes so a block's source is edited in the block's own type size. */
function editingClass(block: Block): string {
  if (block.type === "heading") return `block--heading block--h${block.level}`;
  return isSingleLine(block) ? "" : "block--source-edit";
}

/**
 * Render the title and blocks of `markdown`, calling `onChange` with the new
 * source after every edit. `children` (notices about the page) go under the title.
 */
export function PageEditor({
  markdown,
  fallbackTitle,
  pagePath,
  childTitles,
  onChange,
  children,
}: {
  markdown: MarkdownDocument;
  fallbackTitle: string;
  pagePath: string;
  childTitles: ReadonlyMap<string, string>;
  onChange: (source: string) => void;
  children?: ReactNode;
}) {
  const [focus, setFocus] = useState<Focus | null>(null);
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

  /** Keys in a block: Enter splits, Backspace joins, and Up and Down move between blocks. */
  const onBlockKey =
    (index: number, block: Block) =>
    (event: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (event.nativeEvent.isComposing) return;
      const { selectionStart: start, selectionEnd: end, value } = event.currentTarget;
      const collapsed = start === end;
      if (event.key === "Enter" && !event.shiftKey && isSingleLine(block)) {
        event.preventDefault();
        const text = value.slice(0, start) + value.slice(end);
        const edit = splitBlock(markdown, index, text, start);
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
        setFocus({ kind: "body", line: previous.line + rows.length - 1, column: start });
      } else if (event.key === "ArrowDown" && collapsed && !value.slice(end).includes("\n")) {
        const next = blocks[neighbor(index, 1)];
        if (!next) return;
        event.preventDefault();
        const column = start - (value.lastIndexOf("\n", start - 1) + 1);
        setFocus({ kind: "body", line: next.line, column });
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
            return (
              <div key={key} className={`block block--editing ${editingClass(block)}`}>
                <SourceBox
                  className="block__source"
                  value={blockText(block)}
                  caret={offsetInBlock(block, focus)}
                  label="Edit block"
                  onChange={(value, caret) =>
                    apply(replaceBlockText(markdown, index, value), {
                      kind: "body",
                      ...positionInText(block.line, value, caret),
                    })
                  }
                  onKeyDown={onBlockKey(index, block)}
                  onBlur={release(focus)}
                />
              </div>
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
