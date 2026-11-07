/**
 * Type declarations for the shared Vitest configuration factory.
 */
import type { ViteUserConfig } from "vitest/config";

export declare function createVitestConfig(
  overrides?: ViteUserConfig,
): ViteUserConfig;

declare const config: ViteUserConfig;
export default config;
