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
  clearPrefix,
  indentItem,
  insertDivider,
  insertLines,
  insertLinkLine,
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
  turnInto,
  type Edit,
  type SourcePosition,
  type TurnIntoKind,
} from "./edit";
export { inlineText, parseInline, type Inline } from "./inline";
export {
  README,
  isExternalHref,
  pageLinkLine,
  parsePageLinkLine,
  resolvePageHref,
  type PageLinkLine,
} from "./links";
export { dominantEol, indentWidth, splitLines, type SourceLine } from "./lines";
export {
  LIST_KINDS,
  applyShortcut,
  nestedIndent,
  splitLine,
  type LineKind,
  type LineParts,
} from "./prefix";
