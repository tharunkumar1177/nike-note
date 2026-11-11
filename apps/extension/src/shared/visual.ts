/**
 * Visual blocks (see blueprints/visual-blocks.md): the sandboxed page that
 * runs a visual's HTML, its content security policy, and the messages the
 * app page and the sandbox exchange. The sandbox is a manifest sandbox page
 * with an opaque origin, so a visual's scripts reach neither the extension's
 * APIs nor the helper, and its policy allows no network requests.
 */
import { isRecord } from "./protocol";

/** File name of the sandbox page in the built extension. */
export const VISUAL_PAGE = "visual.html";

/**
 * Content security policy of the sandbox page: inline scripts and styles
 * only, pictures, fonts, and media from `data:` and `blob:` URLs, and no
 * network, forms, popups, or dialogs.
 */
export const VISUAL_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "form-action 'none'",
].join("; ");

/** Largest visual Quire saves or shows, so one stays a small page asset. */
export const MAX_VISUAL_BYTES = 1024 * 1024;
/** Height of a visual before it reports its own. */
export const VISUAL_START_HEIGHT = 320;
/** Smallest height a visual is shown at. */
export const VISUAL_MIN_HEIGHT = 80;
/** Tallest a visual grows; taller content scrolls inside it. */
export const VISUAL_MAX_HEIGHT = 1600;

/** Message types between the app page and the sandbox. */
export const VISUAL_MESSAGES = {
  /** Sandbox to app: the loader is listening. */
  ready: "quire-visual-ready",
  /** App to sandbox: `{ html, scheme }` to show. */
  render: "quire-visual-render",
  /** Sandbox to app: `{ height }` of the shown content in CSS pixels. */
  height: "quire-visual-height",
} as const;

/** Light or dark, as the app page currently looks. */
export type VisualScheme = "light" | "dark";

/** A message from a sandbox, once validated. */
export type VisualMessage = { type: "ready" } | { type: "height"; height: number };

/**
 * Validate a message posted by a sandbox. Anything else, including messages
 * a visual's own scripts post, is ignored.
 */
export function parseVisualMessage(data: unknown): VisualMessage | null {
  if (!isRecord(data)) return null;
  if (data.type === VISUAL_MESSAGES.ready) return { type: "ready" };
  if (
    data.type === VISUAL_MESSAGES.height &&
    typeof data.height === "number" &&
    Number.isFinite(data.height)
  ) {
    return { type: "height", height: data.height };
  }
  return null;
}

/** The height to show a visual at when its content is `height` pixels tall. */
export function visualHeight(height: number): number {
  return Math.min(Math.max(Math.ceil(height), VISUAL_MIN_HEIGHT), VISUAL_MAX_HEIGHT);
}

/**
 * Source of the loader inside the sandbox page, as plain JavaScript so the
 * build can inline it unchanged. It announces itself, takes the first render
 * message from its parent, replaces its own document with the visual's HTML,
 * sets the color scheme, and reports the content height whenever it changes.
 * `M` is {@link VISUAL_MESSAGES}.
 */
const LOADER = `(function (M) {
  var rendered = false;
  function report() {
    var height = document.documentElement.getBoundingClientRect().height;
    window.parent.postMessage({ type: M.height, height: height }, "*");
  }
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (rendered || event.source !== window.parent || !data || typeof data !== "object") return;
    if (data.type !== M.render || typeof data.html !== "string") return;
    rendered = true;
    document.open();
    document.write(data.html);
    document.close();
    document.documentElement.style.colorScheme = data.scheme === "dark" ? "dark" : "light";
    new ResizeObserver(report).observe(document.documentElement);
    report();
  });
  window.parent.postMessage({ type: M.ready }, "*");
})(${JSON.stringify(VISUAL_MESSAGES)});`;

/** The sandbox page: an empty document whose only script is the loader. */
export function visualPageHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="UTF-8"><title>Visual</title></head>',
    `<body><script>${LOADER}</script></body>`,
    "</html>",
    "",
  ].join("\n");
}
