/**
 * Main area for the open page: breadcrumb bar, title, body blocks, and
 * sub-page links (see blueprints/page-tree.md and blueprints/page-rendering.md).
 */
import { inlineText, parseDocument, parseInline, titleBlockIndex } from "@quire/markdown";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { PageIcon } from "../shared/icons";
import { pageHash, pageTrail, type PageNode } from "../shared/pages";
import { BlockList } from "./blocks/BlockList";
import type { PageBodyStore, PageBodyView } from "./pageBodyStore";

/**
 * Explain why the body could not be shown.
 */
function BodyError({ view, onRetry }: { view: PageBodyView; onRetry: () => void }) {
  const error = view.error;
  if (!error) return null;
  const message =
    error.code === "TOO_LARGE"
      ? "This page is too large for Quire to open yet. You can still edit README.md in another editor."
      : error.code === "NOT_FOUND"
        ? "This page was moved or deleted outside Quire."
        : "Quire couldn't open this page.";
  return (
    <div className="page__error" role="alert">
      <p>{message}</p>
      <p className="page__error-detail">{error.message}</p>
      <button type="button" className="q-button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/**
 * Render the page at `path`, or a not-found message when it is not in the tree.
 */
export function PageView({
  root,
  path,
  bodies,
}: {
  root: PageNode;
  path: string;
  bodies: PageBodyStore;
}) {
  const view = useSyncExternalStore(bodies.subscribe, bodies.getSnapshot);
  const trail = pageTrail(root, path);
  const page = trail.at(-1) ?? null;
  const exists = page !== null;

  useEffect(() => {
    if (exists) void bodies.load(path);
  }, [bodies, path, exists]);

  const body = view.path === path ? view.body : null;
  const markdown = useMemo(() => (body ? parseDocument(body.content) : null), [body]);
  const titleIndex = markdown ? titleBlockIndex(markdown.blocks) : -1;
  const titleBlock = titleIndex >= 0 ? markdown?.blocks[titleIndex] : undefined;
  const title =
    titleBlock && "text" in titleBlock
      ? inlineText(parseInline(titleBlock.text))
      : (page?.title ?? null);
  const blocks = markdown ? markdown.blocks.filter((_, index) => index !== titleIndex) : [];
  const linked = new Set(blocks.flatMap((block) => (block.type === "page" ? [block.folder] : [])));
  const settled = body !== null || (view.path === path && view.error !== null);
  const unlinked = settled && page ? page.children.filter((child) => !linked.has(child.name)) : [];
  const childTitles = new Map((page?.children ?? []).map((child) => [child.name, child.title]));

  useEffect(() => {
    document.title = title ? `${title} – Quire` : "Quire";
  }, [title]);

  if (!page) {
    return (
      <main className="page">
        <div className="page__content">
          <h1 className="page__title">Page not found</h1>
          <p className="page__lead">
            There is no page at <code>{path}</code> in this notes folder. It may have been moved
            or deleted outside Quire.
          </p>
          <p className="page__lead">
            <a href={pageHash("")}>Go to {root.title}</a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page" aria-labelledby="page-title" aria-busy={view.loading && !body}>
      <header className="page-bar">
        <nav aria-label="Breadcrumb">
          <ol className="breadcrumb">
            {trail.map((node, index) =>
              index < trail.length - 1 ? (
                <li key={node.path}>
                  <a className="breadcrumb__link" href={pageHash(node.path)}>
                    {node.title}
                  </a>
                </li>
              ) : (
                <li key={node.path}>
                  <span className="breadcrumb__current" aria-current="page">
                    {node.title}
                  </span>
                </li>
              ),
            )}
          </ol>
        </nav>
      </header>
      <div className="page__content">
        <h1 id="page-title" className="page__title">
          {title}
        </h1>
        {view.path === path && <BodyError view={view} onRetry={() => void bodies.load(path)} />}
        {body && !body.exists && (
          <p className="page__lead">
            This page has no <code>README.md</code> yet. Quire creates it the first time you edit
            the page.
          </p>
        )}
        {blocks.length > 0 && (
          <BlockList blocks={blocks} pagePath={path} childTitles={childTitles} />
        )}
        {unlinked.length > 0 && (
          <section className="subpages" aria-labelledby="subpages-title">
            <h2 id="subpages-title" className="subpages__title">
              {linked.size > 0 ? "Other sub-pages" : "Sub-pages"}
            </h2>
            <ul className="subpages__list">
              {unlinked.map((child) => (
                <li key={child.path}>
                  <a className="subpages__link" href={pageHash(child.path)}>
                    <PageIcon />
                    <span>{child.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
