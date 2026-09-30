import type { ConfigArray } from "typescript-eslint";

export type QuireEslintLayer = "core" | "domain" | "tooling" | "app";

export declare const QUIRE_ESLINT_LAYERS: readonly QuireEslintLayer[];

export interface CreateQuireEslintConfigOptions {
  layer: QuireEslintLayer;
  extends?: ConfigArray;
}

export declare function createQuireEslintConfig(
  options: CreateQuireEslintConfigOptions,
): ConfigArray;
