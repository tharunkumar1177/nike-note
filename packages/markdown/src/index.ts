/**
 * Quire's Markdown model: line-mapped blocks, inline styles, and page links.
 * This package is the only place the block rules are implemented.
 */
export {
  MAX_LIST_DEPTH,
  listNumbers,
  parseDocument,
  serializeDocument,
  titleBlockIndex,
  type Block,
  type HeadingLevel,
  type MarkdownDocument,
} from "./blocks";
export {
  blockAtLine,
  blockLineCount,
  blockText,
  insertLines,
  isSingleLine,
  mergeWithPrevious,
  offsetInBlock,
  positionInText,
  removeBlock,
  replaceBlockText,
  setTitle,
  splitBlock,
  titleText,
  toggleTodo,
  type Edit,
  type SourcePosition,
} from "./edit";
export { inlineText, parseInline, type Inline } from "./inline";
export {
  README,
  isExternalHref,
  parsePageLinkLine,
  resolvePageHref,
  type PageLinkLine,
} from "./links";
export { dominantEol, indentWidth, splitLines, type SourceLine } from "./lines";
