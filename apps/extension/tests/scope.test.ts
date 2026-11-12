/**
 * Unit tests for picking end-to-end specs from a branch's changes: feature
 * files run their specs, shared code runs the whole suite, docs run nothing,
 * and the table stays in step with the specs and source files on disk.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SPEC_SOURCES, WHOLE_SUITE, outputLines, scopeFor } from "../e2e/scope";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const E2E = join(ROOT, "apps/extension/e2e");

/** The specs in e2e/, named without `.spec.ts`. */
const ON_DISK = readdirSync(E2E)
  .filter((name) => name.endsWith(".spec.ts"))
  .map((name) => name.slice(0, -".spec.ts".length));

/** Whether a spec is in e2e/. */
function exists(spec: string): boolean {
  return ON_DISK.includes(spec);
}

describe("scopeFor", () => {
  it("runs the specs a feature file belongs to", () => {
    expect(scopeFor(["packages/markdown/src/math.ts"], exists)).toEqual({ kind: "some", specs: ["math"] });
    expect(scopeFor(["helper/src/search.rs", "apps/extension/src/app/SearchDialog.tsx"], exists)).toEqual({
      kind: "some",
      specs: ["search"],
    });
  });

  it("runs every editor spec when the shared editor changes", () => {
    const scope = scopeFor(["apps/extension/src/app/blocks/PageEditor.tsx"], exists);
    expect(scope).toEqual({
      kind: "some",
      specs: ["block-handle", "blocks", "editing", "images", "inline", "math", "rendering", "rich-blocks", "slash", "tables"],
    });
  });

  it("runs a changed spec on its own", () => {
    expect(scopeFor(["apps/extension/e2e/tables.spec.ts", "blueprints/rich-blocks.md"], exists)).toEqual({
      kind: "some",
      specs: ["tables"],
    });
  });

  it("runs the whole suite for the harness, the shell, the helper core, and the toolchain", () => {
    for (const path of [
      "apps/extension/e2e/fixtures.ts",
      "apps/extension/src/build/manifest.ts",
      "apps/extension/src/shared/helperClient.ts",
      "helper/src/host.rs",
      "pnpm-lock.yaml",
    ]) {
      expect(scopeFor(["packages/markdown/src/math.ts", path], exists)).toEqual({ kind: "all" });
    }
  });

  it("runs the whole suite for a code file the table does not know", () => {
    expect(scopeFor(["apps/extension/src/app/NewPanel.tsx"], exists)).toEqual({ kind: "all" });
    expect(scopeFor(["helper/src/newmodule.rs"], exists)).toEqual({ kind: "all" });
  });

  it("runs nothing for docs, workflows, unit tests, and configs no spec exercises", () => {
    const scope = scopeFor(
      [
        "ROADMAP.md",
        "blueprints/build-pipeline.md",
        ".github/workflows/ci.yml",
        "apps/extension/tests/slash.test.ts",
        "packages/markdown/tests/math.test.ts",
        "apps/extension/tsconfig.node.json",
        "apps/extension/eslint.config.js",
        "helper/scripts/smoke.py",
        "apps/extension/e2e/scope.ts",
      ],
      exists,
    );
    expect(scope).toEqual({ kind: "none" });
  });

  it("leaves out specs that are not in e2e/", () => {
    expect(scopeFor(["apps/extension/e2e/removed.spec.ts"], exists)).toEqual({ kind: "none" });
  });
});

describe("outputLines", () => {
  it("writes filters that match the spec on either path separator and nothing else", () => {
    expect(outputLines({ kind: "some", specs: ["blocks", "math"] })).toEqual([
      "scope=some",
      "specs=[\\\\/]blocks\\.spec\\.ts$ [\\\\/]math\\.spec\\.ts$",
    ]);
    const [filter] = outputLines({ kind: "some", specs: ["blocks"] })[1]?.slice("specs=".length).split(" ") ?? [];
    const blocks = new RegExp(filter ?? "");
    expect(blocks.test("C:\\a\\apps\\extension\\e2e\\blocks.spec.ts")).toBe(true);
    expect(blocks.test("/a/apps/extension/e2e/blocks.spec.ts")).toBe(true);
    expect(blocks.test("/a/apps/extension/e2e/rich-blocks.spec.ts")).toBe(false);
  });

  it("writes empty filters for all and none", () => {
    expect(outputLines({ kind: "all" })).toEqual(["scope=all", "specs="]);
    expect(outputLines({ kind: "none" })).toEqual(["scope=none", "specs="]);
  });
});

describe("the spec table", () => {
  it("has an entry for every spec in e2e/", () => {
    expect(Object.keys(SPEC_SOURCES).sort()).toEqual([...ON_DISK].sort());
  });

  it("lists only files and folders that exist", () => {
    const listed = [...new Set([...Object.values(SPEC_SOURCES).flat(), ...WHOLE_SUITE])];
    expect(listed.filter((path) => !existsSync(join(ROOT, path)))).toEqual([]);
  });
});
