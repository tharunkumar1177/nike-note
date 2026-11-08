/**
 * Formatted views of rich blocks (see blueprints/rich-blocks.md): images
 * loaded from the notes folder through the asset store, GitHub-style
 * callouts, and tables with aligned cells.
 */
import {
  parseInline,
  parseTable,
  resolveFileHref,
  type Block,
  type CalloutKind,
  type CellAlign,
} from "@quire/markdown";
import { useContext, useEffect, useSyncExternalStore, type CSSProperties } from "react";

import { AssetContext, type AssetView } from "../assetStore";
import { InlineView } from "./InlineView";

/** Callout headings, as GitHub shows them. */
const CALLOUT_LABELS: Record<CalloutKind, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

/** A subscription that never fires, for images that are not read from the notes folder. */
function subscribeNever(): () => void {
  return () => undefined;
}

/** An image block's picture: where it can be shown from, or why it cannot. */
export type ImageSource =
  | { status: "ready"; url: string; web: boolean }
  | { status: "loading" }
  | { status: "outside" }
  | { status: "error"; message: string; retry: () => void };

/**
 * Where image `block` on page `pagePath` can be shown from. Images in the
 * notes folder load through the helper; web images on `https` load directly;
 * anything else is outside the notes folder.
 */
export function useImageSource(
  block: Extract<Block, { type: "image" }>,
  pagePath: string,
): ImageSource {
  const assets = useContext(AssetContext);
  const web = /^https:\/\//i.test(block.src);
  const path = web ? null : resolveFileHref(pagePath, block.src);
  const view = useSyncExternalStore<AssetView | undefined>(
    assets?.subscribe ?? subscribeNever,
    () => (assets && path !== null ? assets.get(path) : undefined),
  );
  useEffect(() => {
    if (assets && path !== null) assets.request(path);
  }, [assets, path]);

  if (web) return { status: "ready", url: block.src, web: true };
  if (path === null) return { status: "outside" };
  if (view?.status === "ready") return { status: "ready", url: view.url, web: false };
  if (view?.status === "error") {
    return { status: "error", message: view.message, retry: () => assets?.retry(path) };
  }
  return { status: "loading" };
}

/** The picture of image `block`, or a note saying why it is not shown. */
export function ImageContent({
  block,
  source,
  width,
}: {
  block: Extract<Block, { type: "image" }>;
  source: ImageSource;
  /** Shown width in CSS pixels; defaults to the block's own width. */
  width?: number | null;
}) {
  const shown = width === undefined ? block.width : width;
  const style = shown === null ? undefined : { width: shown };
  switch (source.status) {
    case "ready":
      return source.web ? (
        <img
          src={source.url}
          alt={block.alt}
          style={style}
          referrerPolicy="no-referrer"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <img src={source.url} alt={block.alt} style={style} draggable={false} />
      );
    case "outside":
      return (
        <p className="block--image__note">
          This image is outside the notes folder: <code>{block.src}</code>
        </p>
      );
    case "error":
      return (
        <p className="block--image__note" role="alert">
          Quire couldn&apos;t show <code>{block.src}</code>: {source.message}{" "}
          <button type="button" className="block--image__retry" onClick={source.retry}>
            Try again
          </button>
        </p>
      );
    case "loading":
      return (
        <p className="block--image__loading" role="status">
          Loading image…
        </p>
      );
  }
}

/**
 * An image block shown read-only, at its width and alignment, with its title
 * as the caption.
 */
export function ImageView({
  block,
  pagePath,
}: {
  block: Extract<Block, { type: "image" }>;
  pagePath: string;
}) {
  const source = useImageSource(block, pagePath);
  return (
    <figure
      className={`block block--image block--image-${block.align}`}
      title={block.title || undefined}
    >
      <ImageContent block={block} source={source} />
      {block.title && <figcaption className="block__caption">{block.title}</figcaption>}
    </figure>
  );
}

/**
 * A callout: a tinted box with its kind as a heading and each source line as
 * a paragraph.
 */
export function CalloutView({
  block,
  pagePath,
}: {
  block: Extract<Block, { type: "callout" }>;
  pagePath: string;
}) {
  const label = CALLOUT_LABELS[block.kind];
  const paragraphs = block.text.split("\n").filter((line) => line.trim() !== "");
  return (
    <aside className={`block block--callout block--callout-${block.kind}`} aria-label={label}>
      <p className="block--callout__label">{label}</p>
      {paragraphs.map((line, index) => (
        <p key={index} className="block--callout__text">
          <InlineView nodes={parseInline(line)} pagePath={pagePath} />
        </p>
      ))}
    </aside>
  );
}

/** The CSS text alignment for a column alignment. */
function alignStyle(align: CellAlign | undefined): CSSProperties | undefined {
  return align ? { textAlign: align } : undefined;
}

/**
 * A table with a header row, inline formatting in cells, and each column's
 * alignment. Wide tables scroll sideways.
 */
export function TableView({
  block,
  pagePath,
}: {
  block: Extract<Block, { type: "table" }>;
  pagePath: string;
}) {
  const table = parseTable(block.source);
  return (
    <div className="block block--table">
      <table>
        <thead>
          <tr>
            {table.header.map((cell, column) => (
              <th key={column} scope="col" style={alignStyle(table.align[column])}>
                <InlineView nodes={parseInline(cell)} pagePath={pagePath} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, at) => (
            <tr key={at}>
              {row.map((cell, column) => (
                <td key={column} style={alignStyle(table.align[column])}>
                  <InlineView nodes={parseInline(cell)} pagePath={pagePath} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
