/**
 * Build-time renderer for the Quire mark: draws the icon with signed-distance
 * shapes and encodes it as a PNG, so no binary icons are committed.
 */
import { deflateSync } from "node:zlib";

/** Mark geometry in unit coordinates (0 to 1), shared with the SVG mark. */
export const MARK = {
  cornerRadius: 0.22,
  ringCenter: [0.47, 0.47] as const,
  ringRadius: 0.24,
  stroke: 0.1,
  tailStart: [0.58, 0.58] as const,
  tailEnd: [0.75, 0.75] as const,
  background: [0x25, 0x23, 0x20] as const,
  foreground: [0xf7, 0xf6, 0xf3] as const,
};

const SAMPLES = 4;

/**
 * Signed distance from a point to a rounded unit square (negative inside).
 */
function roundedSquareDistance(x: number, y: number, radius: number): number {
  const qx = Math.abs(x - 0.5) - (0.5 - radius);
  const qy = Math.abs(y - 0.5) - (0.5 - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * Distance from a point to the segment between two points.
 */
function segmentDistance(
  x: number,
  y: number,
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.min(
    1,
    Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/**
 * True when a unit-space point lies on the white Q glyph.
 */
function onGlyph(x: number, y: number): boolean {
  const [cx, cy] = MARK.ringCenter;
  const half = MARK.stroke / 2;
  const ring = Math.abs(Math.hypot(x - cx, y - cy) - MARK.ringRadius) <= half;
  const tail = segmentDistance(x, y, MARK.tailStart, MARK.tailEnd) <= half;
  return ring || tail;
}

/**
 * Render the mark as straight RGBA pixels with supersampled antialiasing.
 */
export function renderMark(size: number): Uint8Array {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`Icon size must be a positive integer, got ${size}`);
  }
  const pixels = new Uint8Array(size * size * 4);
  const step = 1 / (size * SAMPLES);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let covered = 0;
      let glyph = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px * SAMPLES + sx + 0.5) * step;
          const y = (py * SAMPLES + sy + 0.5) * step;
          if (roundedSquareDistance(x, y, MARK.cornerRadius) <= 0) {
            covered += 1;
            if (onGlyph(x, y)) glyph += 1;
          }
        }
      }
      const offset = (py * size + px) * 4;
      if (covered === 0) continue;
      const mix = glyph / covered;
      for (let channel = 0; channel < 3; channel += 1) {
        const bg = MARK.background[channel] ?? 0;
        const fg = MARK.foreground[channel] ?? 0;
        pixels[offset + channel] = Math.round(bg + (fg - bg) * mix);
      }
      pixels[offset + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * CRC-32 as used by PNG chunks.
 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build one length-prefixed, CRC-suffixed PNG chunk.
 */
function chunk(type: string, data: Uint8Array): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(typeAndData.length + 8);
  out.writeUInt32BE(data.length, 0);
  typeAndData.copy(out, 4);
  out.writeUInt32BE(crc32(typeAndData), typeAndData.length + 4);
  return out;
}

/**
 * Encode straight RGBA pixels as an 8-bit truecolor-with-alpha PNG.
 */
export function encodePng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new RangeError("Pixel buffer does not match the image size");
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;
    rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * Render the mark at one size as PNG bytes.
 */
export function renderIconPng(size: number): Buffer {
  return encodePng(size, size, renderMark(size));
}
