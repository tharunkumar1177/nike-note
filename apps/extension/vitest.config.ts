/**
 * Vitest config for the extension's unit tests; end-to-end tests run in Playwright.
 */
import { createVitestConfig } from "@quire/config/vitest";

export default createVitestConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
