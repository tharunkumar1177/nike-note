import type { Linter } from "eslint";

export type QuireEslintLayer = "core" | "domain" | "tooling" | "app";

export declare const QUIRE_ESLINT_LAYERS: readonly QuireEslintLayer[];

export interface CreateQuireEslintConfigOptions {
  layer: QuireEslintLayer;
  extends?: Linter.Config[];
}

export declare function createQuireEslintConfig(
  options: CreateQuireEslintConfigOptions,
): Linter.Config[];
