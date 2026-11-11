/**
 * Visual blocks (see blueprints/visual-blocks.md): a link line to an HTML
 * file in the page's `assets` folder, shown as a live page inside the
 * extension's sandbox page. The HTML is read through the asset store and
 * posted to the sandbox, which reports its height back so the frame fits.
 */
import { resolveFileHref, type Block } from "@quire/markdown";
import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  parseVisualMessage,
  VISUAL_MESSAGES,
  VISUAL_PAGE,
  VISUAL_START_HEIGHT,
  visualHeight,
  type VisualScheme,
} from "../../shared/visual";
import { AssetContext, type VisualView as VisualFile } from "../assetStore";

/** The query that says whether the system prefers dark colors. */
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Light or dark, as the app page looks now: its forced theme, or the system's. */
function currentScheme(): VisualScheme {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Follow changes of the system scheme and of the root element's forced theme. */
function subscribeScheme(listener: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", listener);
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    media.removeEventListener("change", listener);
    observer.disconnect();
  };
}

/** The app page's color scheme, kept current. */
function useScheme(): VisualScheme {
  return useSyncExternalStore(subscribeScheme, currentScheme);
}

/** A subscription that never fires, for visuals outside the notes folder. */
function subscribeNever(): () => void {
  return () => undefined;
}

/**
 * The sandboxed frame that runs `html`, titled `title` for assistive
 * technology. It starts at a fixed height and then follows the height its
 * content reports, within limits. A new `html` or scheme starts a new frame.
 */
export function VisualFrame({ html, title }: { html: string; title: string }) {
  const scheme = useScheme();
  return <SandboxFrame key={`${scheme}\n${html}`} html={html} title={title} scheme={scheme} />;
}

/** One sandbox frame showing `html` in `scheme`. */
function SandboxFrame({
  html,
  title,
  scheme,
}: {
  html: string;
  title: string;
  scheme: VisualScheme;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(VISUAL_START_HEIGHT);

  useEffect(() => {
    /** Answer the loader's greeting with the HTML, and follow reported heights. */
    const onMessage = (event: MessageEvent<unknown>): void => {
      const target = frame.current?.contentWindow;
      if (!target || event.source !== target) return;
      const message = parseVisualMessage(event.data);
      if (message?.type === "ready") {
        target.postMessage({ type: VISUAL_MESSAGES.render, html, scheme }, "*");
      } else if (message?.type === "height") {
        setHeight(visualHeight(message.height));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [html, scheme]);

  return (
    <iframe
      ref={frame}
      className="visual-frame"
      src={chrome.runtime.getURL(VISUAL_PAGE)}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      title={title}
      style={{ height, colorScheme: scheme }}
    />
  );
}

/**
 * Where visual `block` on page `pagePath` stands: its HTML once read, why it
 * cannot be shown, and how to read it again.
 */
function useVisualFile(
  block: Extract<Block, { type: "visual" }>,
  pagePath: string,
): { view: VisualFile | { status: "outside" }; reload: () => void } {
  const assets = useContext(AssetContext);
  const path = resolveFileHref(pagePath, block.src);
  const view = useSyncExternalStore<VisualFile | undefined>(
    assets?.subscribe ?? subscribeNever,
    () => (assets && path !== null ? assets.getVisual(path) : undefined),
  );
  useEffect(() => {
    if (assets && path !== null) assets.requestVisual(path);
  }, [assets, path]);
  const reload = (): void => {
    if (assets && path !== null) assets.reloadVisual(path);
  };
  if (path === null || assets === null) return { view: { status: "outside" }, reload };
  return { view: view ?? { status: "loading" }, reload };
}

/** The file name a visual's link points at, for when it has no title. */
function fileName(src: string): string {
  const last = src.split("/").at(-1) ?? src;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * A Visual block: a bar with its title and a Reload button over the running
 * visual, or a note saying why it is not shown. Clicking the bar outside the
 * button edits the link line, like any other block.
 */
export function VisualBlockView({
  block,
  pagePath,
}: {
  block: Extract<Block, { type: "visual" }>;
  pagePath: string;
}) {
  const { view, reload } = useVisualFile(block, pagePath);
  const title = block.title.trim() || fileName(block.src);
  return (
    <figure className="block block--visual" aria-label={`Visual: ${title}`}>
      <figcaption className="block--visual__bar">
        <span className="block--visual__title">{title}</span>
        <button
          type="button"
          className="block--visual__action"
          onClick={reload}
          disabled={view.status === "loading" || view.status === "outside"}
        >
          Reload
        </button>
      </figcaption>
      {view.status === "ready" && <VisualFrame html={view.html} title={title} />}
      {view.status === "loading" && (
        <p className="block--visual__note" role="status">
          Loading visual…
        </p>
      )}
      {view.status === "outside" && (
        <p className="block--visual__note">
          This visual is outside the notes folder: <code>{block.src}</code>
        </p>
      )}
      {view.status === "error" && (
        <p className="block--visual__note" role="alert">
          Quire couldn&apos;t show <code>{block.src}</code>: {view.message}
        </p>
      )}
    </figure>
  );
}
