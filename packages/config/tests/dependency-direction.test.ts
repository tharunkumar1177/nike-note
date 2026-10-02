import { ESLint, type Linter } from "eslint";
import { describe, expect, it } from "vitest";

import {
  createQuireEslintConfig,
  QUIRE_ESLINT_LAYERS,
} from "../eslint/index.js";

const SOURCE_FILE = "src/example.ts";

function restrictedImportMessages(
  messages: Linter.LintMessage[],
): Linter.LintMessage[] {
  return messages.filter((message) => message.ruleId === "no-restricted-imports");
}

function createLayerEslint(layer: (typeof QUIRE_ESLINT_LAYERS)[number]) {
  return new ESLint({
    overrideConfigFile: true,
    overrideConfig: createQuireEslintConfig({ layer }),
  });
}

describe("dependency direction ESLint rule", () => {
  it("reports when core layer imports @quire/db", async () => {
    const eslint = createLayerEslint("core");

    const results = await eslint.lintText(
      "import { connect } from '@quire/db';\n",
      { filePath: SOURCE_FILE },
    );

    const violations = restrictedImportMessages(results[0]?.messages ?? []);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.severity).toBe(2);
  });

  it("allows core layer to import @quire/config/eslint", async () => {
    const eslint = createLayerEslint("core");

    const results = await eslint.lintText(
      "import { createQuireEslintConfig } from '@quire/config/eslint';\n",
      { filePath: "eslint.config.js" },
    );

    const violations = restrictedImportMessages(results[0]?.messages ?? []);
    expect(violations).toHaveLength(0);
  });

  it("allows domain layer to import @quire/core", async () => {
    const eslint = createLayerEslint("domain");

    const results = await eslint.lintText(
      "import { blockSchema } from '@quire/core';\n",
      { filePath: SOURCE_FILE },
    );

    const violations = restrictedImportMessages(results[0]?.messages ?? []);
    expect(violations).toHaveLength(0);
  });

  it("reports when domain layer imports @quire/editor", async () => {
    const eslint = createLayerEslint("domain");

    const results = await eslint.lintText(
      "import { Editor } from '@quire/editor';\n",
      { filePath: SOURCE_FILE },
    );

    const violations = restrictedImportMessages(results[0]?.messages ?? []);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.severity).toBe(2);
  });

  it("reports when app layer imports another app", async () => {
    const eslint = createLayerEslint("app");

    const results = await eslint.lintText(
      "import { appRouter } from '@quire/web';\n",
      { filePath: SOURCE_FILE },
    );

    const violations = restrictedImportMessages(results[0]?.messages ?? []);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.severity).toBe(2);
  });

  it("throws for an unknown layer", () => {
    expect(() =>
      createQuireEslintConfig({ layer: "invalid" as "core" }),
    ).toThrow(/Unknown ESLint layer "invalid"/);
  });
});
