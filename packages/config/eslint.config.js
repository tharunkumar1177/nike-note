/**
 * ESLint config for the shared config package itself.
 */
import { createQuireEslintConfig } from "./eslint/index.js";

export default createQuireEslintConfig({ layer: "tooling" });
