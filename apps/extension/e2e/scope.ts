/**
 * Picks the end-to-end specs a work-branch push has to run, from the files
 * the branch changed since it left main. Each spec lists the source paths
 * whose changes can break it; changes to the shared harness, the app shell,
 * the helper's core, or the toolchain run the whole suite, and so does any
 * code file this table does not know, so a new file is never skipped. Files
 * outside the code folders (docs, plans, workflows) and unit tests run nothing.
 * The whole suite still runs on every manual run of the workflow.
 *
 * Run as `node e2e/scope.ts <base>` from apps/extension; prints the
 * `specs` and `scope` lines the CI e2e job reads.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The specs a set of changes needs: all of them, some of them, or none. */
export type Scope = { kind: "all" } | { kind: "some"; specs: string[] } | { kind: "none" };

const EXT = "apps/extension/src/";
const HELPER = "helper/src/";
const MARKDOWN = "packages/markdown/src/";

/** The page editor and the Markdown model every block spec goes through. */
const EDITOR = [
  `${EXT}app/blocks/PageEditor.tsx`,
  `${EXT}app/blocks/BlockView.tsx`,
  `${EXT}app/blocks/InlineView.tsx`,
  `${EXT}app/blocks/PopoverMenu.tsx`,
  `${EXT}app/app.css`,
  `${EXT}shared/icons.tsx`,
  `${MARKDOWN}blocks.ts`,
  `${MARKDOWN}edit.ts`,
  `${MARKDOWN}inline.ts`,
  `${MARKDOWN}lines.ts`,
  `${MARKDOWN}prefix.ts`,
  `${MARKDOWN}index.ts`,
];

/** Image files read from and written to a page's assets folder. */
const ASSETS = [`${EXT}app/assetStore.ts`, `${HELPER}assets.rs`, `${HELPER}base64.rs`];

/**
 * For each spec in e2e/ (named without `.spec.ts`), the files or folders
 * (ending in `/`) whose changes run it. A changed spec file always runs itself.
 */
export const SPEC_SOURCES: Record<string, string[]> = {
  shell: [`${EXT}popup/`, `${EXT}app/ConnectionScreen.tsx`, `${EXT}app/ScreenCard.tsx`, `${EXT}shared/QuireMark.tsx`, `${HELPER}install.rs`],
  setup: [`${EXT}app/FolderPicker.tsx`, `${EXT}app/GitSetup.tsx`, `${EXT}app/workspaceStore.ts`, `${EXT}shared/workspace.ts`, `${HELPER}git.rs`],
  pages: [`${EXT}app/PageTreeNav.tsx`, `${EXT}app/pageTreeStore.ts`, `${EXT}app/PageView.tsx`, `${EXT}shared/pages.ts`, `${HELPER}pages.rs`, `${MARKDOWN}links.ts`],
  "page-operations": [
    `${EXT}app/PageActions.tsx`,
    `${EXT}app/pageOps.ts`,
    `${EXT}app/PageTreeNav.tsx`,
    `${EXT}app/pageTreeStore.ts`,
    `${EXT}shared/pages.ts`,
    `${HELPER}pageops.rs`,
    `${HELPER}relink.rs`,
    `${HELPER}pages.rs`,
    `${MARKDOWN}links.ts`,
  ],
  rendering: [`${EXT}app/PageView.tsx`, `${EXT}shared/pageBody.ts`, `${HELPER}body.rs`, ...EDITOR],
  editing: [`${EXT}app/pageEditorStore.ts`, `${EXT}shared/pageBody.ts`, `${EXT}shared/pending.ts`, `${HELPER}body.rs`, `${HELPER}watch.rs`, ...EDITOR],
  sync: [`${EXT}app/syncStore.ts`, `${EXT}app/SyncNotice.tsx`, `${EXT}app/StatusBar.tsx`, `${EXT}shared/sync.ts`, `${HELPER}sync.rs`, `${HELPER}git.rs`],
  blocks: [`${EXT}app/blocks/caretPoint.ts`, `${EXT}app/pageEditorStore.ts`, ...EDITOR],
  slash: [`${EXT}app/blocks/SlashMenu.tsx`, `${EXT}shared/slash.ts`, `${EXT}app/pageOps.ts`, `${HELPER}pageops.rs`, ...EDITOR],
  inline: [`${EXT}app/blocks/FormatToolbar.tsx`, `${EXT}shared/shortcuts.ts`, `${MARKDOWN}format.ts`, `${MARKDOWN}links.ts`, ...EDITOR],
  "block-handle": [`${EXT}app/blocks/BlockHandle.tsx`, `${EXT}shared/shortcuts.ts`, ...EDITOR],
  "rich-blocks": [`${EXT}app/blocks/RichBlocks.tsx`, `${MARKDOWN}image.ts`, `${MARKDOWN}table.ts`, ...ASSETS, ...EDITOR],
  tables: [`${EXT}app/blocks/TableEditor.tsx`, `${MARKDOWN}table.ts`, `${MARKDOWN}format.ts`, ...EDITOR],
  images: [`${EXT}app/blocks/ImageEditor.tsx`, `${MARKDOWN}image.ts`, ...ASSETS, ...EDITOR],
  math: [`${EXT}app/math/`, `${EXT}app/blocks/MathEditor.tsx`, `${EXT}app/blocks/MathFormula.tsx`, `${MARKDOWN}math.ts`, `${MARKDOWN}format.ts`, ...EDITOR],
  search: [`${EXT}app/SearchDialog.tsx`, `${EXT}shared/search.ts`, `${HELPER}search.rs`],
  settings: [`${EXT}app/SettingsDialog.tsx`, `${EXT}app/ShortcutsDialog.tsx`, `${EXT}app/appearanceContext.ts`, `${EXT}shared/appearance.ts`, `${EXT}shared/shortcuts.ts`],
  ai: [`${EXT}app/ai/`, `${EXT}shared/ai.ts`],
};

/** Changes that can break every spec: the harness, the app shell, the helper's core, and the toolchain. */
export const WHOLE_SUITE = [
  "apps/extension/e2e/fixtures.ts",
  "apps/extension/e2e/notes.ts",
  "apps/extension/playwright.config.ts",
  "apps/extension/package.json",
  "apps/extension/vite.config.ts",
  `${EXT}build/`,
  `${EXT}app/App.tsx`,
  `${EXT}app/Connected.tsx`,
  `${EXT}app/Workspace.tsx`,
  `${EXT}app/main.tsx`,
  `${EXT}app/connection.ts`,
  `${EXT}app/route.ts`,
  `${EXT}shared/helperClient.ts`,
  `${EXT}shared/protocol.ts`,
  `${EXT}shared/identity.ts`,
  `${EXT}shared/platform.ts`,
  `${EXT}shared/tokens.css`,
  "packages/markdown/package.json",
  "packages/config/",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  ".nvmrc",
  "helper/Cargo.toml",
  "helper/Cargo.lock",
  "helper/rust-toolchain.toml",
  `${HELPER}main.rs`,
  `${HELPER}host.rs`,
  `${HELPER}framing.rs`,
  `${HELPER}protocol.rs`,
  `${HELPER}identity.rs`,
  `${HELPER}config.rs`,
  `${HELPER}dirs.rs`,
  `${HELPER}paths.rs`,
  `${HELPER}workspace.rs`,
];

/** Folders holding code the e2e suite exercises; unknown files elsewhere never run specs. */
const CODE_FOLDERS = ["apps/", "packages/", "helper/"];

/** Files inside the code folders that no spec exercises: unit tests, lint and type configs, docs, and this file. */
const NOT_EXERCISED = [
  /\/tests\//,
  /\.test\.ts$/,
  /\.md$/,
  /(^|\/)eslint\.config\.js$/,
  /(^|\/)vitest\.config\.ts$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /^helper\/src\/testdir\.rs$/,
  /^helper\/scripts\//,
  /^apps\/extension\/e2e\/scope\.ts$/,
];

const SPEC_FILE = /^apps\/extension\/e2e\/([^/]+)\.spec\.ts$/;

/** Whether a repository path is a listed file or sits inside a listed folder. */
function covers(entries: readonly string[], path: string): boolean {
  return entries.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));
}

/**
 * Chooses the specs for a list of changed repository paths (forward slashes).
 * `exists` reports whether a spec is in e2e/, so deleted or not yet merged
 * specs are left out. Specs come back sorted, without duplicates.
 */
export function scopeFor(changed: readonly string[], exists: (spec: string) => boolean): Scope {
  const specs = new Set<string>();
  for (const path of changed) {
    const spec = SPEC_FILE.exec(path)?.[1];
    if (spec !== undefined) {
      specs.add(spec);
      continue;
    }
    if (covers(WHOLE_SUITE, path)) return { kind: "all" };
    if (NOT_EXERCISED.some((pattern) => pattern.test(path))) continue;
    let known = false;
    for (const [name, sources] of Object.entries(SPEC_SOURCES)) {
      if (covers(sources, path)) {
        specs.add(name);
        known = true;
      }
    }
    if (!known && CODE_FOLDERS.some((folder) => path.startsWith(folder))) return { kind: "all" };
  }
  const present = [...specs].filter(exists).sort();
  return present.length > 0 ? { kind: "some", specs: present } : { kind: "none" };
}

/**
 * Formats a scope as the GitHub output lines the e2e job reads: `scope` is
 * all, some, or none, and `specs` holds space-separated Playwright file
 * filters for some. Playwright matches filters as regular expressions against
 * the file path, so each one anchors on the separator before the name (either
 * slash, for Windows) and keeps `blocks` from matching `rich-blocks`.
 */
export function outputLines(scope: Scope): string[] {
  const specs = scope.kind === "some" ? scope.specs.map((spec) => `[\\\\/]${spec}\\.spec\\.ts$`).join(" ") : "";
  return [`scope=${scope.kind}`, `specs=${specs}`];
}

/** Lists the files changed between the merge base with `base` and HEAD. */
function changedSince(base: string, cwd: string): string[] {
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const mergeBase = git("merge-base", base, "HEAD");
  return git("diff", "--name-only", "--no-renames", mergeBase, "HEAD")
    .split("\n")
    .filter((line) => line.length > 0);
}

/** Prints the output lines for the changes since `base` (default origin/main). */
function main(): void {
  const base = process.argv[2] ?? "origin/main";
  const e2eDir = dirname(fileURLToPath(import.meta.url));
  const scope = scopeFor(changedSince(base, e2eDir), (spec) => existsSync(join(e2eDir, `${spec}.spec.ts`)));
  for (const line of outputLines(scope)) console.log(line);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
