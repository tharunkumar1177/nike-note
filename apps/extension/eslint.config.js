/**
 * ESLint config for the extension app, adding the React hooks rules.
 */
import { createQuireEslintConfig } from "@quire/config/eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default createQuireEslintConfig({
  layer: "app",
  extends: [reactHooks.configs.flat.recommended],
});
