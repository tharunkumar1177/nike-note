/**
 * Main area for the open page: breadcrumb bar with the save state, the
 * editable title and body, and sub-page links (see blueprints/page-tree.md,
 * blueprints/page-rendering.md, and blueprints/page-editing.md).
 */
import {
  assetImageLine,
  inlineText,
  parseDocument,
  parseInline,
  titleBlockIndex,
  type Block,
} from "@quire/markdown";
import { useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { PageIcon } from "../shared/icons";
import { pageHash, pageTrail, type CreatedPage, type PageNode } from "../shared/pages";
import { AssetContext } from "./assetStore";
import { PageEditor } from "./blocks/PageEditor";
import type { PageEditorStore, PageEditorView } from "./pageEditorStore";

/** Folders of the sub-pages that `blocks` link, including links inside toggles. */
function linkedFolders(blocks: readonly Block[]): string[] {
  return blocks.flatMap((block) => {
    if (block.type === "page") return [block.folder];
    if (block.type === "toggle") return linkedFolders(parseDocument(block.body).blocks);
    return [];
  });
}

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
  treeLoading,
  onCreatePage,
  onRename,
}: {
  root: PageNode;
  path: string;
  editor: PageEditorStore;
  /** True while the page tree reloads, when a just-moved page may be missing from it. */
  treeLoading: boolean;
  onCreatePage: (parent: string, title: string) => Promise<CreatedPage>;
  onRename: (path: string, title: string, from: string) => Promise<void>;
}) {
  const view = useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  const assets = useContext(AssetContext);
  const [renameError, setRenameError] = useState<{ path: string; message: string } | null>(
    null,
  );
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
  const linked = new Set(linkedFolders(markdown?.blocks ?? []));
  const settled = source !== null || (current && view.error !== null);
  const unlinked = settled && page ? page.children.filter((child) => !linked.has(child.name)) : [];
  const childTitles = new Map((page?.children ?? []).map((child) => [child.name, child.title]));

  useEffect(() => {
    document.title = title ? `${title} – Quire` : "Quire";
  }, [title]);

  /**
   * Rename the page after its title was edited from `from` to `next`,
   * reporting a failure below the title.
   */
  const commitTitle = (next: string, from: string): void => {
    setRenameError(null);
    onRename(path, next, from).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setRenameError({ path, message });
    });
  };

  if (!page && treeLoading) return <main className="page" aria-busy="true" />;
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
            onTitleCommit={commitTitle}
            onAddImage={
              assets
                ? async (file) => assetImageLine((await assets.save(path, file)).name)
                : undefined
            }
          >
            {renameError?.path === path && (
              <p className="page__inline-error" role="alert">
                Quire couldn&apos;t rename the page folder: {renameError.message}
              </p>
            )}
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
