import { defineConfig, mergeConfig } from "vitest/config";

/**
 * Shared Vitest defaults for Quire workspaces.
 *
 * @param {import('vitest/config').UserConfig} [overrides] Workspace-specific overrides merged last.
 * @returns {import('vitest/config').UserConfig}
 */
export function createVitestConfig(overrides = {}) {
  const base = defineConfig({
    test: {
      environment: "node",
      include: ["**/*.{test,spec}.{ts,tsx,js,mjs}"],
      passWithNoTests: true,
      restoreMocks: true,
    },
  });

  return mergeConfig(base, overrides);
}

export default createVitestConfig();
