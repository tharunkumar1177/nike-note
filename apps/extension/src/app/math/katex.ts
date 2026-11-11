/**
 * KaTeX and its stylesheet and fonts, in a chunk of their own that
 * `mathStore.ts` imports only when a page first shows math (see
 * blueprints/rich-blocks.md).
 */
import katex from "katex";
import "katex/dist/katex.min.css";

export default katex;
