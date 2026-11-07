/**
 * Vitest config for the Markdown package's unit tests.
 */
import { createVitestConfig } from "@quire/config/vitest";

export default createVitestConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
