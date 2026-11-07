/**
 * ESLint config for the Markdown package: core layer, no app or package imports.
 */
import { createQuireEslintConfig } from "@quire/config/eslint";

export default createQuireEslintConfig({ layer: "core" });
