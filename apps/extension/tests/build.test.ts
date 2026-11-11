/**
 * Unit tests for the generated manifest (including the visual sandbox), the
 * fixed extension ID, and the icon PNGs.
 */
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  buildManifest,
  EXTENSION_PUBLIC_KEY,
  ICON_SIZES,
} from "../src/build/manifest";
import { startupLeaks, type ChunkInfo } from "../src/build/plugin";
import { crc32, encodePng, renderIconPng, renderMark } from "../src/build/png";
import { EXTENSION_ID } from "../src/shared/identity";
import { VISUAL_CSP, VISUAL_PAGE } from "../src/shared/visual";

/**
 * Derive a Chrome extension ID from a base64 public key.
 */
function extensionIdFromKey(key: string): string {
  const hash = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex");
  return [...hash.slice(0, 32)]
    .map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))
    .join("");
}

describe("manifest", () => {
  it("fixes the extension ID shared with the helper", () => {
    expect(extensionIdFromKey(EXTENSION_PUBLIC_KEY)).toBe(EXTENSION_ID);
  });

  it("declares MV3, the popup, native messaging, and every icon", () => {
    const manifest = buildManifest("0.1.0");
    expect(manifest).toMatchObject({
      manifest_version: 3,
      name: "Quire",
      version: "0.1.0",
      key: EXTENSION_PUBLIC_KEY,
      permissions: ["nativeMessaging", "storage"],
      action: { default_popup: "popup.html" },
    });
    expect(Object.keys(manifest.icons as object)).toEqual(ICON_SIZES.map(String));
  });

  it("declares the visual page as a sandbox with its own policy", () => {
    const manifest = buildManifest("0.1.0");
    expect(manifest.sandbox).toEqual({ pages: [VISUAL_PAGE] });
    expect(manifest.content_security_policy).toEqual({ sandbox: VISUAL_CSP });
  });

  it("rejects versions Chrome cannot parse", () => {
    expect(() => buildManifest("1.0.0-beta")).toThrow();
  });
});

describe("startupLeaks", () => {
  const sdk = "/repo/node_modules/.pnpm/@google+genai@3.0.0/node_modules/@google/genai/dist/web/index.mjs";
  /** A chunk with the given static imports and modules. */
  const chunk = (fileName: string, isEntry: boolean, imports: string[], moduleIds: string[]) =>
    ({ fileName, isEntry, imports, moduleIds }) satisfies ChunkInfo;

  it("allows a provider SDK in a chunk loaded only by dynamic import", () => {
    expect(
      startupLeaks([
        chunk("app.js", true, ["shared.js"], ["/repo/src/app/main.tsx"]),
        chunk("shared.js", false, [], ["/repo/node_modules/react/index.js"]),
        chunk("gemini.js", false, ["shared.js"], [sdk]),
      ]),
    ).toEqual([]);
  });

  it("reports a provider SDK reachable from an entry by static imports", () => {
    expect(
      startupLeaks([
        chunk("popup.js", true, [], []),
        chunk("app.js", true, ["vendor.js"], []),
        chunk("vendor.js", false, ["deep.js"], []),
        chunk("deep.js", false, ["vendor.js"], [sdk.replaceAll("/", "\\")]),
      ]),
    ).toEqual([`deep.js: ${sdk.replaceAll("/", "\\")}`]);
  });

  it("treats KaTeX like a provider SDK", () => {
    const katex = "/repo/node_modules/.pnpm/katex@0.19.1/node_modules/katex/dist/katex.mjs";
    expect(startupLeaks([chunk("app.js", true, [], [katex])])).toEqual([`app.js: ${katex}`]);
    expect(
      startupLeaks([chunk("app.js", true, [], []), chunk("katex.js", false, [], [katex])]),
    ).toEqual([]);
  });
});

describe("icon PNG", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("encodes a valid PNG header and pixel stream", () => {
    const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(1);

    const idatLength = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString("ascii")).toBe("IDAT");
    const rows = inflateSync(png.subarray(41, 41 + idatLength));
    expect([...rows]).toEqual([0, 255, 0, 0, 255, 0, 0, 255, 128]);
  });

  it("draws an opaque center and transparent corners", () => {
    const size = 32;
    const pixels = renderMark(size);
    const alphaAt = (x: number, y: number) => pixels[(y * size + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(16, 2)).toBe(255);
    expect(renderIconPng(16).length).toBeGreaterThan(50);
  });

  it("rejects invalid sizes", () => {
    expect(() => renderMark(0)).toThrow(RangeError);
  });
});
