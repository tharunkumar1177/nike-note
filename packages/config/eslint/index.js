import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/** @typedef {'core' | 'domain' | 'tooling' | 'app'} QuireEslintLayer */

export const QUIRE_ESLINT_LAYERS = Object.freeze(
  /** @type {readonly QuireEslintLayer[]} */ ([
    "core",
    "domain",
    "tooling",
    "app",
  ]),
);

const SOURCE_GLOBS = ["**/*.{ts,tsx,js,jsx,mjs,cjs}"];

const APP_IMPORT_PATHS = [
  {
    name: "@quire/web",
    message: "Apps must not import other apps (@quire/web).",
  },
  {
    name: "@quire/realtime",
    message: "Apps must not import other apps (@quire/realtime).",
  },
  {
    name: "@quire/worker",
    message: "Apps must not import other apps (@quire/worker).",
  },
];

/**
 * Resolve dependency-direction rules for a workspace layer.
 *
 * @param {QuireEslintLayer} layer
 * @returns {import('eslint').Linter.Config}
 */
function createDependencyDirectionConfig(layer) {
  /** @type {import('eslint').Linter.RuleEntry} */
  let restrictedImportsRule;

  switch (layer) {
    case "core":
      restrictedImportsRule = [
        "error",
        {
          paths: APP_IMPORT_PATHS,
          patterns: [
            {
              group: ["@quire/*", "!@quire/config"],
              message:
                "packages/core must not import @quire/* packages; only @quire/config tooling is allowed.",
            },
          ],
        },
      ];
      break;

    case "domain":
      restrictedImportsRule = [
        "error",
        {
          paths: APP_IMPORT_PATHS,
          patterns: [
            {
              group: ["@quire/*", "!@quire/core", "!@quire/config"],
              message:
                "This package may import only @quire/core and @quire/config.",
            },
          ],
        },
      ];
      break;

    case "tooling":
      restrictedImportsRule = [
        "error",
        {
          paths: APP_IMPORT_PATHS,
          patterns: [
            {
              group: ["@quire/*", "!@quire/config"],
              message:
                "Packages may import only @quire/config for shared tooling.",
            },
          ],
        },
      ];
      break;

    case "app":
      restrictedImportsRule = [
        "error",
        {
          paths: APP_IMPORT_PATHS,
        },
      ];
      break;

    default:
      throw new Error(
        `Unknown ESLint layer "${layer}". Expected one of: ${QUIRE_ESLINT_LAYERS.join(", ")}`,
      );
  }

  return {
    files: SOURCE_GLOBS,
    rules: {
      "no-restricted-imports": restrictedImportsRule,
    },
  };
}

/**
 * Validate and normalize the workspace layer argument.
 *
 * @param {unknown} layer
 * @returns {QuireEslintLayer}
 */
function assertLayer(layer) {
  if (
    typeof layer !== "string" ||
    !/** @type {readonly string[]} */ (QUIRE_ESLINT_LAYERS).includes(layer)
  ) {
    throw new Error(
      `Unknown ESLint layer "${layer}". Expected one of: ${QUIRE_ESLINT_LAYERS.join(", ")}`,
    );
  }

  return /** @type {QuireEslintLayer} */ (layer);
}

/**
 * Build the shared Quire ESLint flat config for one workspace layer.
 *
 * @param {object} options
 * @param {QuireEslintLayer} options.layer Workspace dependency layer.
 * @param {import('eslint').Linter.Config[]} [options.extends] Additional flat config entries appended last.
 * @returns {import('eslint').Linter.Config[]}
 */
export function createQuireEslintConfig(options) {
  const validatedLayer = assertLayer(options?.layer);
  const { extends: extensions = [] } = options ?? {};

  return defineConfig(
    {
      ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
      rules: {
        // TypeScript (and checkJs) already report undefined identifiers.
        "no-undef": "off",
      },
    },
    createDependencyDirectionConfig(validatedLayer),
    ...extensions,
  );
}
