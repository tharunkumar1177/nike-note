/**
 * Source lines with their original line endings, so a document can be put
 * back together byte for byte.
 */

/** One source line: its text and the line ending that followed it ("" for the last line). */
export interface SourceLine {
  text: string;
  eol: string;
}

/**
 * Split text into lines, keeping each `\n` or `\r\n` ending. A lone `\r` stays in the text.
 */
export function splitLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  while (start < source.length) {
    const newline = source.indexOf("\n", start);
    if (newline === -1) {
      lines.push({ text: source.slice(start), eol: "" });
      break;
    }
    const crlf = newline > start && source[newline - 1] === "\r";
    lines.push({
      text: source.slice(start, crlf ? newline - 1 : newline),
      eol: crlf ? "\r\n" : "\n",
    });
    start = newline + 1;
  }
  return lines;
}

/**
 * The line ending used by most lines, `\n` when there are none or it is a tie.
 */
export function dominantEol(lines: readonly SourceLine[]): "\n" | "\r\n" {
  let crlf = 0;
  let lf = 0;
  for (const line of lines) {
    if (line.eol === "\r\n") crlf += 1;
    else if (line.eol === "\n") lf += 1;
  }
  return crlf > lf ? "\r\n" : "\n";
}

/**
 * Width of a line's leading whitespace, counting a tab as four columns.
 */
export function indentWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    if (char === " ") width += 1;
    else if (char === "\t") width += 4 - (width % 4);
    else break;
  }
  return width;
}
