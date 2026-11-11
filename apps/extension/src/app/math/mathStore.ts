/**
 * Rendering TeX for block equations and inline math (see
 * blueprints/rich-blocks.md). KaTeX loads the first time something asks for
 * it, so pages without math never load it. Untrusted commands (`\href`,
 * `\includegraphics`, `\html…`) stay disabled, so a page cannot add links,
 * images, or markup through its math.
 */
import type katexApi from "katex";
import { useSyncExternalStore } from "react";

/** The KaTeX API this app uses. */
type Katex = typeof katexApi;

/** Whether the renderer can be used yet. */
export type MathRenderer =
  | { status: "loading" }
  | { status: "ready"; katex: Katex }
  | { status: "failed"; message: string };

/** TeX rendered to HTML, or the reason it cannot be. */
type RenderedMath = { html: string } | { error: string };

/** Most rendered formulas kept, so retyping or scrolling does not render them again. */
const CACHE_SIZE = 256;

let renderer: MathRenderer = { status: "loading" };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const cache = new Map<string, RenderedMath>();

/** Start loading KaTeX once, and tell every subscriber when it settles. */
function load(): void {
  loading ??= import("./katex").then(
    (module) => {
      renderer = { status: "ready", katex: module.default };
      listeners.forEach((listener) => listener());
    },
    (error: unknown) => {
      renderer = {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
      listeners.forEach((listener) => listener());
    },
  );
}

/** Follow the renderer's state, loading KaTeX on first use. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

/** The renderer's current state. */
function snapshot(): MathRenderer {
  return renderer;
}

/** The math renderer, loading it the first time a component asks. */
export function useMathRenderer(): MathRenderer {
  return useSyncExternalStore(subscribe, snapshot);
}

/** TeX as it can be shown right now. */
export type MathResult =
  | { status: "loading" }
  | { status: "ready"; html: string }
  | { status: "error"; message: string };

/** TeX `tex` rendered as display math (`display`) or inline, once KaTeX has loaded. */
export function useRenderedMath(tex: string, display: boolean): MathResult {
  const current = useMathRenderer();
  if (current.status === "loading") return { status: "loading" };
  if (current.status === "failed") {
    return { status: "error", message: `Quire couldn't load the math renderer: ${current.message}` };
  }
  const rendered = renderMath(current.katex, tex, display);
  return "html" in rendered
    ? { status: "ready", html: rendered.html }
    : { status: "error", message: rendered.error };
}

/** The reason KaTeX gives for TeX it cannot read, without its prefix. */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^KaTeX parse error:\s*/, "");
}

/**
 * TeX `tex` rendered by `katex` as display math (`display`) or inline, as
 * HTML with MathML for screen readers, or the error that stops it.
 */
function renderMath(katex: Katex, tex: string, display: boolean): RenderedMath {
  const key = `${display ? "d" : "i"}${tex}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  let result: RenderedMath;
  try {
    result = {
      html: katex.renderToString(tex, {
        displayMode: display,
        output: "htmlAndMathml",
        throwOnError: true,
        trust: false,
        strict: "ignore",
        maxSize: 100,
        maxExpand: 1000,
      }),
    };
  } catch (error) {
    result = { error: reason(error) };
  }
  cache.set(key, result);
  if (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return result;
}
