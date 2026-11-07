/**
 * Renders inline Markdown nodes. Page links open in Quire, web and mail links
 * open in a new tab, and any other link is shown as text with its target.
 */
import { isExternalHref, resolvePageHref, type Inline } from "@quire/markdown";

import { pageHash } from "../../shared/pages";

/**
 * Render a list of inline nodes for the page at `pagePath`.
 */
export function InlineView({ nodes, pagePath }: { nodes: readonly Inline[]; pagePath: string }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineNode key={index} node={node} pagePath={pagePath} />
      ))}
    </>
  );
}

/**
 * Render one inline node.
 */
function InlineNode({ node, pagePath }: { node: Inline; pagePath: string }) {
  switch (node.type) {
    case "text":
      return <>{node.text}</>;
    case "code":
      return <code className="inline-code">{node.text}</code>;
    case "bold":
      return (
        <strong>
          <InlineView nodes={node.children} pagePath={pagePath} />
        </strong>
      );
    case "italic":
      return (
        <em>
          <InlineView nodes={node.children} pagePath={pagePath} />
        </em>
      );
    case "strike":
      return (
        <s>
          <InlineView nodes={node.children} pagePath={pagePath} />
        </s>
      );
    case "link": {
      const label = <InlineView nodes={node.children} pagePath={pagePath} />;
      if (isExternalHref(node.href)) {
        return (
          <a className="inline-link" href={node.href} target="_blank" rel="noreferrer noopener">
            {label}
          </a>
        );
      }
      const page = resolvePageHref(pagePath, node.href);
      if (page !== null) {
        return (
          <a className="inline-link" href={pageHash(page)}>
            {label}
          </a>
        );
      }
      return (
        <span className="inline-link inline-link--inert" title={node.href}>
          {label}
        </span>
      );
    }
  }
}
