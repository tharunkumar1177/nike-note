/**
 * Verifies the dependency-direction ESLint rules for each workspace layer.
 */
import { ESLint, type Linter } from "eslint";
import { describe, expect, it } from "vitest";

import {
  createQuireEslintConfig,
  QUIRE_ESLINT_LAYERS,
} from "../eslint/index.js";

const SOURCE_FILE = "src/example.ts";

/**
 * Keep only messages produced by the restricted-imports rule.
 */
function restrictedImportMessages(
  messages: Linter.LintMessage[],
): Linter.LintMessage[] {
  return messages.filter(
    (message) => message.ruleId === "no-restricted-imports",
  );
}

/**
 * Create an ESLint instance configured for one layer only.
 */
function createLayerEslint(layer: (typeof QUIRE_ESLINT_LAYERS)[number]) {
  return new ESLint({
    overrideConfigFile: true,
    overrideConfig: createQuireEslintConfig({ layer }),
  });
}

/**
 * Lint one source string and return its restricted-import violations.
 */
async function violationsFor(
  layer: (typeof QUIRE_ESLINT_LAYERS)[number],
  source: string,
  filePath = SOURCE_FILE,
): Promise<Linter.LintMessage[]> {
  const results = await createLayerEslint(layer).lintText(source, { filePath });
  return restrictedImportMessages(results[0]?.messages ?? []);
}

describe("dependency direction ESLint rule", () => {
  it("reports when the core layer imports another Quire package", async () => {
    const violations = await violationsFor(
      "core",
      "import { x } from '@quire/other';\n",
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.severity).toBe(2);
  });

  it("allows the core layer to import @quire/config tooling", async () => {
    const violations = await violationsFor(
      "core",
      "import { createQuireEslintConfig } from '@quire/config/eslint';\n",
      "eslint.config.js",
    );
    expect(violations).toHaveLength(0);
  });

  it("reports when a package imports the extension app", async () => {
    const violations = await violationsFor(
      "core",
      "import { App } from '@quire/extension';\n",
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows the app layer to import packages", async () => {
    const violations = await violationsFor(
      "app",
      "import { parse } from '@quire/markdown';\n",
    );
    expect(violations).toHaveLength(0);
  });

  it("reports when the app layer imports an app", async () => {
    const violations = await violationsFor(
      "app",
      "import { App } from '@quire/extension';\n",
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("throws for an unknown layer", () => {
    expect(() =>
      createQuireEslintConfig({ layer: "invalid" as "core" }),
    ).toThrow(/Unknown ESLint layer "invalid"/);
  });
});
