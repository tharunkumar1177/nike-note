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
import {
  useContext,
  useEffect,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

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

/**
 * An image block. Images in the notes folder load through the helper; web
 * images on `https` load directly without a referrer; anything else shows
 * an explanation instead.
 */
export function ImageView({
  block,
  pagePath,
}: {
  block: Extract<Block, { type: "image" }>;
  pagePath: string;
}) {
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

  const alt = block.alt;
  let content: ReactNode;
  if (web) {
    content = <img src={block.src} alt={alt} referrerPolicy="no-referrer" loading="lazy" />;
  } else if (path === null) {
    content = (
      <p className="block--image__note">
        This image is outside the notes folder: <code>{block.src}</code>
      </p>
    );
  } else if (view?.status === "ready") {
    content = <img src={view.url} alt={alt} />;
  } else if (view?.status === "error") {
    content = (
      <p className="block--image__note" role="alert">
        Quire couldn&apos;t show <code>{block.src}</code>: {view.message}{" "}
        <button type="button" className="block--image__retry" onClick={() => assets?.retry(path)}>
          Try again
        </button>
      </p>
    );
  } else {
    content = (
      <p className="block--image__loading" role="status">
        Loading image…
      </p>
    );
  }
  return (
    <figure className="block block--image" title={block.title || undefined}>
      {content}
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
