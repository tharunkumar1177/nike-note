/**
 * Main area for the open page: breadcrumb bar, title, and sub-page links.
 */
import { useEffect } from "react";

import { PageIcon } from "../shared/icons";
import { pageHash, pageTrail, type PageNode } from "../shared/pages";

/**
 * Render the page at `path`, or a not-found message when it is not in the tree.
 */
export function PageView({ root, path }: { root: PageNode; path: string }) {
  const trail = pageTrail(root, path);
  const page = trail.at(-1) ?? null;
  const title = page?.title ?? null;

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
    <main className="page" aria-labelledby="page-title">
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
          {page.title}
        </h1>
        {!page.hasReadme && (
          <p className="page__lead">
            This page has no <code>README.md</code> yet. Quire creates it the first time you edit
            the page.
          </p>
        )}
        {page.children.length > 0 && (
          <section className="subpages" aria-labelledby="subpages-title">
            <h2 id="subpages-title" className="subpages__title">
              Sub-pages
            </h2>
            <ul className="subpages__list">
              {page.children.map((child) => (
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
