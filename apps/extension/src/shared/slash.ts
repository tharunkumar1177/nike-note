/**
 * The commands of the slash menu and how a typed query picks them (see
 * blueprints/slash-menu.md). Typing `/` then a name such as `h2`, `todo`, or
 * `page` narrows the list; the best match comes first.
 */
import type { TemplateKind, TurnIntoKind } from "@quire/markdown";

/**
 * What a slash command does: turn the line into a block type, add a block
 * from a template, start an inline equation, add an image, add an
 * interactive visual, add a sub-page, or write with AI.
 */
export type SlashCommand =
  | TurnIntoKind
  | TemplateKind
  | "inlineMath"
  | "image"
  | "visual"
  | "page"
  | "ai";

/** One entry of the slash menu. */
export interface SlashItem {
  command: SlashCommand;
  label: string;
  /** Short explanation shown under the label. */
  hint: string;
  /** Other names the command is found by, lower case. */
  keywords: readonly string[];
}

/** Every slash command, in menu order. */
export const SLASH_ITEMS: readonly SlashItem[] = [
  { command: "text", label: "Text", hint: "Plain text", keywords: ["text", "plain", "paragraph"] },
  ...([1, 2, 3, 4, 5, 6] as const).map(
    (level): SlashItem => ({
      command: `h${level}`,
      label: `Heading ${level}`,
      hint: `${"#".repeat(level)} heading`,
      keywords: [`h${level}`, `heading${level}`, "heading"],
    }),
  ),
  {
    command: "bullet",
    label: "Bulleted list",
    hint: "A list with bullets",
    keywords: ["bullet", "bulleted", "list", "ul"],
  },
  {
    command: "numbered",
    label: "Numbered list",
    hint: "A list with numbers",
    keywords: ["numbered", "number", "list", "ol"],
  },
  {
    command: "todo",
    label: "To-do list",
    hint: "Track tasks with a checkbox",
    keywords: ["todo", "to-do", "task", "checkbox"],
  },
  { command: "quote", label: "Quote", hint: "A quoted passage", keywords: ["quote", "blockquote"] },
  { command: "code", label: "Code", hint: "A code block", keywords: ["code", "codeblock", "fence"] },
  {
    command: "divider",
    label: "Divider",
    hint: "A line between sections",
    keywords: ["divider", "line", "rule", "hr"],
  },
  {
    command: "table",
    label: "Table",
    hint: "Rows and columns",
    keywords: ["table", "grid", "columns", "rows"],
  },
  {
    command: "callout",
    label: "Callout",
    hint: "A note that stands out",
    keywords: ["callout", "note", "tip", "warning", "alert"],
  },
  {
    command: "toggle",
    label: "Toggle",
    hint: "Content that opens and closes",
    keywords: ["toggle", "details", "collapse", "fold"],
  },
  {
    command: "math",
    label: "Block equation",
    hint: "A TeX formula on its own line",
    keywords: ["math", "equation", "tex", "latex", "formula", "katex"],
  },
  {
    command: "inlineMath",
    label: "Inline equation",
    hint: "A TeX formula inside the text",
    keywords: ["inlinemath", "inline", "equation", "math", "tex", "latex", "formula"],
  },
  {
    command: "image",
    label: "Image",
    hint: "Add a picture from your computer",
    keywords: ["image", "picture", "photo", "img"],
  },
  {
    command: "visual",
    label: "Visual",
    hint: "An interactive diagram that explains a concept",
    keywords: ["visual", "interactive", "diagram", "html", "explainer", "animation", "demo"],
  },
  {
    command: "page",
    label: "Page",
    hint: "A sub-page inside this page",
    keywords: ["page", "subpage", "sub-page", "new"],
  },
  {
    command: "ai",
    label: "Write with AI",
    hint: "Describe what to add, such as a plan or a list",
    keywords: ["ai", "write", "generate", "assistant", "draft"],
  },
];

/** Lower case without spaces, so "Heading 2" matches "heading2". */
function squash(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

/**
 * How well `item` matches `query`: 0 for an exact name, 1 for a name that
 * starts with it, 2 for a name that contains it, or null for no match.
 */
function rank(item: SlashItem, query: string): number | null {
  const names = [squash(item.label), ...item.keywords];
  if (names.includes(query)) return 0;
  if (names.some((name) => name.startsWith(query))) return 1;
  if (names.some((name) => name.includes(query))) return 2;
  return null;
}

/**
 * The commands matching the text typed after `/`, best first and otherwise
 * in menu order. An empty query lists every command.
 */
export function filterSlashItems(query: string): SlashItem[] {
  const wanted = squash(query);
  if (wanted === "") return [...SLASH_ITEMS];
  return SLASH_ITEMS.flatMap((item, order) => {
    const score = rank(item, wanted);
    return score === null ? [] : [{ item, score, order }];
  })
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map(({ item }) => item);
}
