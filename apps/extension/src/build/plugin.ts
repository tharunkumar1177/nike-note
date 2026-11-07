/**
 * Vite plugin that emits the extension manifest and the PNG icons into the
 * build, and fails the build when a provider SDK would load at startup.
 */
import type { Plugin } from "vite";

import { buildManifest, ICON_SIZES } from "./manifest";
import { renderIconPng } from "./png";

/** Packages that may only be bundled into lazily loaded chunks. */
const LAZY_PACKAGES = ["@google/genai"];

/** The parts of an output chunk the startup check reads. */
export interface ChunkInfo {
  fileName: string;
  isEntry: boolean;
  /** Chunks this one imports statically. */
  imports: readonly string[];
  moduleIds: readonly string[];
}

/**
 * True when module `id` belongs to one of the lazy-only packages.
 */
function isLazyOnly(id: string): boolean {
  const path = id.replaceAll("\\", "/");
  return LAZY_PACKAGES.some((name) => path.includes(`/node_modules/${name}/`));
}

/**
 * The lazy-only modules that would load at startup: those in an entry chunk
 * or in a chunk an entry imports statically, directly or not. Each finding
 * names the chunk and the module.
 */
export function startupLeaks(chunks: readonly ChunkInfo[]): string[] {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const startup = new Set<string>();
  const pending = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName);
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (startup.has(name)) continue;
    startup.add(name);
    pending.push(...(byName.get(name)?.imports ?? []));
  }
  return [...startup].flatMap((name) =>
    (byName.get(name)?.moduleIds ?? []).filter(isLazyOnly).map((id) => `${name}: ${id}`),
  );
}

/**
 * Emit `manifest.json` and `icons/icon-<size>.png` during `vite build`.
 */
export function quireExtension(options: { version: string }): Plugin {
  return {
    name: "quire-extension",
    apply: "build",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((output) =>
        output.type === "chunk" ? [output] : [],
      );
      const leaks = startupLeaks(chunks);
      if (leaks.length > 0) {
        this.error(`Provider SDKs must load lazily, but these load at startup:\n${leaks.join("\n")}`);
      }
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
