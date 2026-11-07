/**
 * Main area for the open page: breadcrumb bar with the save state, the
 * editable title and body, and sub-page links (see blueprints/page-tree.md,
 * blueprints/page-rendering.md, and blueprints/page-editing.md).
 */
import { inlineText, parseDocument, parseInline, titleBlockIndex } from "@quire/markdown";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { PageIcon } from "../shared/icons";
import { pageHash, pageTrail, type CreatedPage, type PageNode } from "../shared/pages";
import { PageEditor } from "./blocks/PageEditor";
import type { PageEditorStore, PageEditorView } from "./pageEditorStore";

/**
 * Explain why the page could not be opened.
 */
function LoadError({ view, onRetry }: { view: PageEditorView; onRetry: () => void }) {
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
 * Where the open page's changes stand, with a retry for a failed save.
 */
function SaveStatus({ view, onRetry }: { view: PageEditorView; onRetry: () => void }) {
  if (view.source === null) return null;
  const label = {
    saved: "Saved",
    pending: "Unsaved changes",
    saving: "Saving…",
    failed: "Couldn't save",
    conflict: "Not saved",
  }[view.save];
  return (
    <div className="save-status" role="status" data-state={view.save}>
      <span title={view.saveError ?? undefined}>{label}</span>
      {view.save === "failed" && (
        <button type="button" className="save-status__retry" onClick={onRetry}>
          Retry
        </button>
      )}
      {view.unsavedElsewhere > 0 && (
        <span className="save-status__others">
          {view.unsavedElsewhere === 1
            ? "Another page is not saved yet"
            : `${view.unsavedElsewhere} other pages are not saved yet`}
        </span>
      )}
    </div>
  );
}

/**
 * Offer both ways out of a conflict between Quire's text and the file on disk.
 */
function ConflictBanner({ editor }: { editor: PageEditorStore }) {
  return (
    <div className="page__conflict" role="alert">
      <p>
        This page changed on disk while you were editing it. Choose which version to keep; the
        other is discarded.
      </p>
      <div className="page__conflict-actions">
        <button
          type="button"
          className="q-button q-button--primary"
          onClick={() => editor.resolveConflict("mine")}
        >
          Keep my version
        </button>
        <button type="button" className="q-button" onClick={() => editor.resolveConflict("disk")}>
          Use the version on disk
        </button>
      </div>
    </div>
  );
}

/**
 * Render the page at `path`, or a not-found message when it is not in the tree.
 */
export function PageView({
  root,
  path,
  editor,
  onCreatePage,
}: {
  root: PageNode;
  path: string;
  editor: PageEditorStore;
  onCreatePage: (parent: string, title: string) => Promise<CreatedPage>;
}) {
  const view = useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  const trail = pageTrail(root, path);
  const page = trail.at(-1) ?? null;
  const exists = page !== null;

  useEffect(() => {
    if (exists) void editor.open(path);
  }, [editor, path, exists]);

  const current = view.path === path;
  const source = current ? view.source : null;
  const markdown = useMemo(() => (source === null ? null : parseDocument(source)), [source]);
  const titleBlock = markdown ? markdown.blocks[titleBlockIndex(markdown.blocks)] : undefined;
  const title =
    titleBlock?.type === "heading"
      ? inlineText(parseInline(titleBlock.text))
      : (page?.title ?? null);
  const linked = new Set(
    (markdown?.blocks ?? []).flatMap((block) => (block.type === "page" ? [block.folder] : [])),
  );
  const settled = source !== null || (current && view.error !== null);
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
    <main className="page" aria-labelledby="page-title" aria-busy={view.loading}>
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
        {current && <SaveStatus view={view} onRetry={() => editor.retry()} />}
      </header>
      <div className="page__content">
        {markdown ? (
          <PageEditor
            key={path}
            markdown={markdown}
            fallbackTitle={page.title}
            pagePath={path}
            childTitles={childTitles}
            onChange={(next) => editor.edit(next)}
            onCreatePage={(childTitle) => onCreatePage(path, childTitle)}
            onTransform={(change) => editor.transform(path, change)}
          >
            {view.save === "conflict" && <ConflictBanner editor={editor} />}
            {!view.exists && (
              <p className="page__lead">
                This page has no <code>README.md</code> yet. Quire creates it when you start
                writing.
              </p>
            )}
          </PageEditor>
        ) : (
          <h1 id="page-title" className="page__title">
            {page.title}
          </h1>
        )}
        {current && <LoadError view={view} onRetry={() => void editor.open(path)} />}
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
