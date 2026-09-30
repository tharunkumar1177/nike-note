import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Case-insensitive forbidden brand pattern (never spell the word literally). */
export const FORBIDDEN_WORD_PATTERN = /n[i]ke/i;

/**
 * Scan files for forbidden-word violations in paths and line content.
 *
 * @param {{ path: string, content: string }[]} files
 * @returns {{ path: string, line: number, match: string }[]}
 */
export function findViolations(files) {
  const violations = [];

  for (const file of files) {
    const pathMatch = FORBIDDEN_WORD_PATTERN.exec(file.path);
    if (pathMatch) {
      violations.push({
        path: file.path,
        line: 0,
        match: pathMatch[0],
      });
    }

    const lines = file.content.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const lineMatch = FORBIDDEN_WORD_PATTERN.exec(lines[index]);
      if (lineMatch) {
        violations.push({
          path: file.path,
          line: index + 1,
          match: lineMatch[0],
        });
      }
    }
  }

  return violations;
}

/**
 * List tracked files via git, skip binaries, and return path/content pairs.
 *
 * @returns {{ path: string, content: string }[]}
 */
function loadTrackedFiles() {
  const output = execSync("git ls-files -z", { encoding: "utf8" });
  const trackedPaths = output.split("\0").filter(Boolean);
  const files = [];

  for (const relativePath of trackedPaths) {
    const buffer = readFileSync(relativePath);
    if (buffer.includes(0)) {
      continue;
    }

    files.push({
      path: relativePath,
      content: buffer.toString("utf8"),
    });
  }

  return files;
}

/** CLI entry: print violations and exit 1 when any are found. */
function runCli() {
  const violations = findViolations(loadTrackedFiles());

  for (const violation of violations) {
    if (violation.line === 0) {
      console.error(`${violation.path}: forbidden word in path (${violation.match})`);
      continue;
    }

    console.error(
      `${violation.path}:${violation.line}: forbidden word (${violation.match})`,
    );
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : undefined;

if (invokedPath && path.resolve(modulePath) === invokedPath) {
  runCli();
}
