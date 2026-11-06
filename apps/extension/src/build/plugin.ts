/**
 * Vite plugin that emits the extension manifest and the PNG icons into the build.
 */
import type { Plugin } from "vite";

import { buildManifest, ICON_SIZES } from "./manifest";
import { renderIconPng } from "./png";

/**
 * Emit `manifest.json` and `icons/icon-<size>.png` during `vite build`.
 */
export function quireExtension(options: { version: string }): Plugin {
  return {
    name: "quire-extension",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(buildManifest(options.version), null, 2)}\n`,
      });
      for (const size of ICON_SIZES) {
        this.emitFile({
          type: "asset",
          fileName: `icons/icon-${size}.png`,
          source: renderIconPng(size),
        });
      }
    },
  };
}
