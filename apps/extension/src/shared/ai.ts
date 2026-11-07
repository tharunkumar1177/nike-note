/**
 * AI contracts shared by the app (see blueprints/ai-assist.md): the stored
 * settings and their validator, the provider adapter interface, model
 * choice, the summary prompt, and readable error messages. Provider SDKs are
 * never imported here.
 */
import { isRecord } from "./protocol";

/** Providers Quire can call. */
export type ProviderId = "gemini";

/** Every provider ID, in menu order. */
export const PROVIDER_IDS: readonly ProviderId[] = ["gemini"];

/** What the user chose in AI setup, kept in `chrome.storage.local`. */
export interface AiSettings {
  provider: ProviderId;
  model: string;
  key: string;
}

/** A model the user can pick. */
export interface AiModel {
  /** The ID sent to the provider, for example `gemini-2.5-flash`. */
  id: string;
  label: string;
}

/** A model as a provider lists it. */
export interface ListedModel {
  name?: string;
  displayName?: string;
  supportedActions?: string[];
}

/** One text generation: instructions and the user's prompt. */
export interface AiPrompt {
  system: string;
  prompt: string;
}

/** A generation request with the credentials and model to use. */
export interface AiRequest extends AiPrompt {
  key: string;
  model: string;
  signal: AbortSignal;
}

/** One provider adapter, loaded lazily with its SDK. */
export interface AiProvider {
  /** The models usable for text generation with `key`, best default first. */
  listModels(key: string, signal: AbortSignal): Promise<AiModel[]>;
  /** Generate text, yielding it in pieces as it arrives. */
  stream(request: AiRequest): AsyncIterable<string>;
}

/** Most characters of a page sent to a provider. */
export const MAX_PAGE_CHARS = 100_000;

/** Model families that cannot write text answers. */
const NOT_TEXT = /embedding|aqa|tts|image|imagen|veo|audio|live|robotics|computer-use/i;

/**
 * Validate stored settings; anything malformed counts as not set up.
 */
export function parseAiSettings(value: unknown): AiSettings | null {
  if (
    !isRecord(value) ||
    !PROVIDER_IDS.includes(value.provider as ProviderId) ||
    typeof value.model !== "string" ||
    typeof value.key !== "string" ||
    value.model.trim() === "" ||
    value.key.trim() === ""
  ) {
    return null;
  }
  return { provider: value.provider as ProviderId, model: value.model, key: value.key };
}

/**
 * The listed models that write text, without their `models/` prefix and
 * sorted by label.
 */
export function textModels(models: readonly ListedModel[]): AiModel[] {
  const seen = new Set<string>();
  const result: AiModel[] = [];
  for (const model of models) {
    const id = (model.name ?? "").replace(/^models\//, "");
    if (id === "" || seen.has(id) || NOT_TEXT.test(id)) continue;
    if (!model.supportedActions?.includes("generateContent")) continue;
    seen.add(id);
    result.push({ id, label: model.displayName?.trim() || id });
  }
  return result.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

/**
 * The version number in a model ID such as `gemini-2.5-flash`, or 0.
 */
function modelVersion(id: string): number {
  const match = /-(\d+(?:\.\d+)?)-/.exec(id);
  return match ? Number(match[1]) : 0;
}

/**
 * The model to preselect: `previous` when still offered, otherwise the newest
 * stable Flash model, otherwise the first.
 */
export function defaultModel(models: readonly AiModel[], previous: string | null): string | null {
  if (previous && models.some((model) => model.id === previous)) return previous;
  const flash = models
    .filter((model) => /^gemini-\d+(\.\d+)?-flash$/.test(model.id))
    .sort((a, b) => modelVersion(b.id) - modelVersion(a.id));
  return flash[0]?.id ?? models[0]?.id ?? null;
}

/**
 * The page text sent to a provider: `markdown` with the byte order mark
 * removed, cut to {@link MAX_PAGE_CHARS} with a note when longer.
 */
export function pageForPrompt(markdown: string): string {
  const text = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (text.length <= MAX_PAGE_CHARS) return text;
  return `${text.slice(0, MAX_PAGE_CHARS)}\n\n[The rest of the page was cut because it is long.]`;
}

/**
 * The prompt that summarizes page `title` with body `markdown`.
 */
export function summaryPrompt(title: string, markdown: string): AiPrompt {
  return {
    system:
      "You summarize one page of a person's notes for them. Write 3 to 7 short Markdown " +
      "bullet points (lines starting with \"- \") covering the main points, decisions, " +
      "dates, and open to-dos. Use only what the page says. Write in the page's language. " +
      "Do not add a heading, an introduction, or a closing remark.",
    prompt: pageContext(title, markdown),
  };
}

/** The page context every prompt about a page carries. */
function pageContext(title: string, markdown: string): string {
  return `Page title: ${title}\n\nPage (Markdown):\n${pageForPrompt(markdown)}`;
}

/**
 * The prompt that writes new content for page `title` (body `markdown`) as
 * the user asked in `request`.
 */
export function writePrompt(request: string, title: string, markdown: string): AiPrompt {
  return {
    system:
      "You write new content for one page of a person's Markdown notes. Answer with only " +
      "the Markdown to add to the page: no introduction, no closing remark, and no code " +
      "fence around the answer. Use headings from ## down, paragraphs, \"- \" bullets, " +
      "\"1. \" numbered lists, \"- [ ] \" to-dos, \"> \" quotes, and GitHub tables where " +
      "they fit. Never use a # heading. Use the page for context and do not repeat it. " +
      "Write in the language of the request.",
    prompt: `${pageContext(title, markdown)}\n\nWhat to write:\n${request.trim()}`,
  };
}

/**
 * The prompt that answers `question` about page `title` with body `markdown`.
 */
export function askPrompt(question: string, title: string, markdown: string): AiPrompt {
  return {
    system:
      "You answer questions about one page of a person's notes. Use only what the page " +
      "says; when it does not contain the answer, say so in one sentence. Be brief. Answer " +
      "in Markdown, in the language of the question.",
    prompt: `${pageContext(title, markdown)}\n\nQuestion:\n${question.trim()}`,
  };
}

/**
 * Generated Markdown made ready to insert into a page: a `markdown` code
 * fence wrapped around the whole answer is removed, `#` headings become `##` so the page
 * keeps one title, and surrounding blank lines are trimmed.
 */
export function cleanGenerated(text: string): string {
  let lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[0]?.trim() === "") lines.shift();
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  const first = lines[0]?.trim() ?? "";
  if (/^(```|~~~)\s*(markdown|md)$/i.test(first) && lines.at(-1)?.trim() === first.slice(0, 3)) {
    lines = lines.slice(1, -1);
  }
  let fence: string | null = null;
  return lines
    .map((line) => {
      const marker = /^\s*(```|~~~)/.exec(line)?.[1] ?? null;
      if (marker && (fence === null || fence === marker)) fence = fence === null ? marker : null;
      return fence === null && /^# /.test(line) ? `#${line}` : line;
    })
    .join("\n")
    .trim();
}

/**
 * A readable message for a failed AI call. Provider errors often carry a
 * JSON body; its `error.message` is used when present. Streamed calls wrap
 * the body's text in another such message, so nested bodies are unwrapped.
 */
export function describeAiError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "Stopped.";
  let message = error instanceof Error ? error.message : String(error);
  for (let depth = 0; depth < 3; depth += 1) {
    const inner = jsonErrorMessage(message);
    if (inner === null) break;
    message = inner;
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "The AI provider could not be reached. Check your connection and try again.";
  }
  return message;
}

/**
 * The `error.message` of a JSON error body found in `text`, or null when the
 * text holds no such body.
 */
function jsonErrorMessage(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    const body: unknown = JSON.parse(text.slice(start));
    if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
      return body.error.message.trim();
    }
  } catch {
    return null;
  }
  return null;
}
