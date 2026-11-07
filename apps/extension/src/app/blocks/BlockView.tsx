/**
 * Renders one block formatted, as shown when the caret is not in it. Page
 * blocks show the sub-page's current title from `childTitles` (keyed by folder
 * name) when it exists, so a renamed heading shows up without rewriting the
 * link line.
 */
import { parseInline, type Block } from "@quire/markdown";
import type { CSSProperties, ReactNode } from "react";

import { PageIcon } from "../../shared/icons";
import { pageHash } from "../../shared/pages";
import { InlineView } from "./InlineView";

/** Bullet glyphs by nesting depth, repeating. */
const BULLETS = ["•", "◦", "▪"];

/**
 * Inline content of a text-bearing block.
 */
function Text({ text, pagePath }: { text: string; pagePath: string }) {
  return <InlineView nodes={parseInline(text)} pagePath={pagePath} />;
}

/**
 * A list item row with its marker and indentation.
 */
function ListItem({
  depth,
  marker,
  className,
  children,
}: {
  depth: number;
  marker: ReactNode;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={`block block--list ${className}`} style={{ "--depth": depth } as CSSProperties}>
      <span className="block__marker">{marker}</span>
      <div className="block__body">{children}</div>
    </div>
  );
}

/**
 * Render one block formatted. `onToggle` checks or unchecks a to-do item.
 */
export function BlockView({
  block,
  number,
  pagePath,
  childTitles,
  onToggle,
}: {
  block: Block;
  number: number | undefined;
  pagePath: string;
  childTitles: ReadonlyMap<string, string>;
  onToggle: () => void;
}) {
  switch (block.type) {
    case "text":
      return block.text.trim() === "" ? (
        <div className="block block--empty" aria-hidden="true" />
      ) : (
        <p className="block block--text">
          <Text text={block.text} pagePath={pagePath} />
        </p>
      );
    case "heading": {
      const Tag = `h${Math.min(block.level + 1, 6)}` as "h2";
      return (
        <Tag className={`block block--heading block--h${block.level}`}>
          <Text text={block.text} pagePath={pagePath} />
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="block block--quote">
          <Text text={block.text} pagePath={pagePath} />
        </blockquote>
      );
    case "bullet":
      return (
        <ListItem
          depth={block.depth}
          marker={BULLETS[block.depth % BULLETS.length]}
          className="block--bullet"
        >
          <Text text={block.text} pagePath={pagePath} />
        </ListItem>
      );
    case "numbered":
      return (
        <ListItem
          depth={block.depth}
          marker={`${number ?? block.number}.`}
          className="block--numbered"
        >
          <Text text={block.text} pagePath={pagePath} />
        </ListItem>
      );
    case "todo":
      return (
        <ListItem
          depth={block.depth}
          marker={
            <input
              type="checkbox"
              className="block__checkbox"
              checked={block.checked}
              onChange={onToggle}
              aria-label={block.checked ? "Done" : "Not done"}
            />
          }
          className={block.checked ? "block--todo block--done" : "block--todo"}
        >
          <Text text={block.text} pagePath={pagePath} />
        </ListItem>
      );
    case "divider":
      return <hr className="block block--divider" />;
    case "code":
      return (
        <figure className="block block--code">
          {block.language && <figcaption className="block__caption">{block.language}</figcaption>}
          <pre>
            <code>{block.code}</code>
          </pre>
        </figure>
      );
    case "page": {
      const target = pagePath === "" ? block.folder : `${pagePath}/${block.folder}`;
      const title = childTitles.get(block.folder) ?? (block.title.trim() || block.folder);
      return (
        <a className="block block--page" href={pageHash(target)}>
          <PageIcon />
          <span className="block--page__title">{title}</span>
        </a>
      );
    }
    case "frontMatter":
      return (
        <details className="block block--properties">
          <summary>Properties</summary>
          <pre>
            <code>{block.yaml}</code>
          </pre>
        </details>
      );
    case "table":
      return (
        <pre className="block block--source" aria-label="Table source">
          <code>{block.source}</code>
        </pre>
      );
  }
}