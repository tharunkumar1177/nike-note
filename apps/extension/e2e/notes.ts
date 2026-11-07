/**
 * End-to-end helpers that run Git inside the sandbox and prepare a notes
 * folder that is already set up, so tests can start at the workspace.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Sandbox } from "./fixtures";

/**
 * Run git with the sandbox's empty global configuration and return its output.
 */
export function git(sandbox: Sandbox, args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(sandbox.dir, "gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}

/**
 * Create `home/notes` with the given files and empty folders, commit it, push it
 * to a bare remote, and remember it as the helper's notes folder.
 */
export async function createNotes(
  sandbox: Sandbox,
  files: Record<string, string>,
  folders: string[] = [],
): Promise<string> {
  const notes = join(sandbox.home, "notes");
  const remote = join(sandbox.dir, "remote.git");
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(notes, path)), { recursive: true });
    await writeFile(join(notes, path), text);
  }
  for (const folder of folders) await mkdir(join(notes, folder), { recursive: true });
  await mkdir(notes, { recursive: true });

  git(sandbox, ["init", "--bare", "--quiet", remote]);
  git(sandbox, ["init", "--quiet", "--initial-branch=main"], notes);
  git(sandbox, ["config", "user.name", "Ana Writer"], notes);
  git(sandbox, ["config", "user.email", "ana@example.com"], notes);
  git(sandbox, ["add", "--all"], notes);
  git(sandbox, ["commit", "--quiet", "--allow-empty", "-m", "Seed notes"], notes);
  git(sandbox, ["remote", "add", "origin", remote], notes);
  git(sandbox, ["push", "--quiet", "--set-upstream", "origin", "main"], notes);

  await mkdir(join(sandbox.config, "quire"), { recursive: true });
  await writeFile(
    join(sandbox.config, "quire", "config.json"),
    JSON.stringify({ notesRoot: notes }),
  );
  return notes;
}
