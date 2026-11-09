/**
 * Block equations (architecture.md#block-model-and-line-mapping): TeX between
 * `$$` lines, on one `$$…$$` line, or in a ```` ```math ```` fence, the forms
 * GitHub renders as display math, and the source an equation is written back
 * as when its TeX changes.
 */
import type { SourceLine } from "./lines";

/** How a block equation is written in the file. */
export type MathForm = "dollars" | "line" | "fence";

/** The parts of a block equation. */
export interface MathParts {
  /** The TeX, lines joined by `\n`. */
  tex: string;
  form: MathForm;
}

/** A line that is only `$$`, opening or closing an equation. */
const DOLLARS = /^ {0,3}\$\$[ \t]*$/;
/** A line that is only `$$…$$` with no other `$` inside. */
const DOLLARS_LINE = /^ {0,3}\$\$([^$]*[^$\s][^$]*)\$\$[ \t]*$/;
/** A line that would open a code fence. */
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;

/** True when `text` is a `$$` line that opens or closes an equation. */
export function isDollarsLine(text: string): boolean {
  return DOLLARS.test(text);
}

/**
 * The closing `$$` line of the equation whose opening `$$` is line `start`,
 * or -1 when the file ends or an empty line comes first, since GitHub ends
 * display math at an empty line.
 */
export function dollarsEnd(lines: readonly SourceLine[], start: number): number {
  for (let index = start + 1; index < lines.length; index += 1) {
    const text = lines[index]?.text ?? "";
    if (DOLLARS.test(text)) return index;
    if (text.trim() === "") return -1;
  }
  return -1;
}

/** The TeX of a one-line `$$…$$` equation, or null for any other line. */
export function parseMathLine(text: string): string | null {
  return DOLLARS_LINE.exec(text)?.[1] ?? null;
}

/** True when `tex` can sit between `$$` lines and still read back the same. */
function fitsDollars(lines: readonly string[]): boolean {
  return lines.every(
    (line) => line.trim() !== "" && !DOLLARS.test(line) && !FENCE_LINE.test(line),
  );
}

/**
 * The source lines (joined by `\n`, with no final line ending) for an
 * equation of TeX `tex`, written in `form` when the TeX fits it: a one-line
 * equation stays on one line while it has no line break or `$`, and `$$`
 * lines hold TeX without empty lines, `$$` lines, or fence lines. Anything
 * else is written as a ```` ```math ```` fence longer than any backtick run
 * in the TeX.
 */
export function mathSource(tex: string, form: MathForm): string {
  const text = tex.replace(/\r\n?/g, "\n");
  const lines = text === "" ? [] : text.split("\n");
  if (form === "line" && lines.length === 1 && !text.includes("$") && text.trim() !== "") {
    return `$$${text}$$`;
  }
  if (form !== "fence" && fitsDollars(lines)) return ["$$", ...lines, "$$"].join("\n");
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return [`${fence}math`, ...lines, fence].join("\n");
}
