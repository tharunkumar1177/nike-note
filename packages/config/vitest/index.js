import { defineConfig, mergeConfig } from "vitest/config";

/**
 * Shared Vitest defaults for Quire workspaces.
 *
 * @param {import('vitest/config').UserConfig} [overrides] Workspace-specific overrides merged last.
 * @returns {import('vitest/config').UserConfig}
 */
export function createVitestConfig(overrides = {}) {
  const { test: testOverrides = {}, ...restOverrides } = overrides;
  const {
    include = ["**/*.{test,spec}.{ts,tsx,js,mjs}"],
    ...remainingTestOverrides
  } = testOverrides;

  const base = defineConfig({
    test: {
      environment: "node",
      include,
      exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
      passWithNoTests: true,
      restoreMocks: true,
      ...remainingTestOverrides,
    },
  });

  return mergeConfig(base, restOverrides);
}

export default createVitestConfig();
