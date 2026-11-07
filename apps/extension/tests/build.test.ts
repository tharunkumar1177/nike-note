/**
 * Unit tests for the generated manifest, the fixed extension ID, and the icon PNGs.
 */
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  buildManifest,
  EXTENSION_PUBLIC_KEY,
  ICON_SIZES,
} from "../src/build/manifest";
import { crc32, encodePng, renderIconPng, renderMark } from "../src/build/png";
import { EXTENSION_ID } from "../src/shared/identity";

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
      permissions: ["nativeMessaging"],
      action: { default_popup: "popup.html" },
    });
    expect(Object.keys(manifest.icons as object)).toEqual(ICON_SIZES.map(String));
  });

  it("rejects versions Chrome cannot parse", () => {
    expect(() => buildManifest("1.0.0-beta")).toThrow();
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
