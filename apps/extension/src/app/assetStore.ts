/**
 * External store for page images (see blueprints/rich-blocks.md). Images are
 * read through the helper's chunked `readAsset` and kept as object URLs, the
 * most recently used 64 at a time; new images are saved with `writeAsset`
 * into the page's `assets` folder.
 */
import { createContext } from "react";

import type { HelperConnection } from "../shared/helperClient";
import { isRecord } from "../shared/protocol";

/** What an image block shows for one image file. */
export type AssetView =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

/** An image saved by `writeAsset`: its path in the notes folder and its file name. */
export interface SavedAsset {
  path: string;
  name: string;
}

/** Largest image that can be added, matching the helper's limit. */
export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
/** Images kept loaded at once; older ones are released. */
const MAX_CACHED = 64;
/** Time allowed for one chunk or one save. */
const ASSET_TIMEOUT_MS = 60_000;
/** File extensions for image types whose files may come without a usable name. */
const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

/** One chunk of an image file. */
interface Chunk {
  size: number;
  mime: string;
  data: string;
}

/**
 * Validate a `readAsset` reply.
 */
function parseChunk(value: unknown): Chunk {
  if (
    !isRecord(value) ||
    typeof value.size !== "number" ||
    typeof value.mime !== "string" ||
    typeof value.data !== "string"
  ) {
    throw new TypeError("The helper sent an invalid image chunk.");
  }
  return { size: value.size, mime: value.mime, data: value.data };
}

/**
 * Validate a `writeAsset` reply.
 */
export function parseSavedAsset(value: unknown): SavedAsset {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.name !== "string") {
    throw new TypeError("The helper sent an invalid saved image.");
  }
  return { path: value.path, name: value.name };
}

/** Bytes from base64. */
function fromBase64(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Base64 for bytes, built in slices so large images do not overflow the call stack. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/**
 * The name to save `file` under: its own name when it has an image
 * extension, otherwise `image` with the extension of its type.
 */
export function imageFileName(file: { name: string; type: string }): string | null {
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(file.name)) return file.name;
  const extension = EXTENSIONS[file.type];
  if (extension === undefined) return null;
  const stem = file.name.replace(/\.[^.]*$/, "").trim() || "image";
  return `${stem}.${extension}`;
}

/** The message of an error of any kind. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Loads, caches, and saves the images of one notes folder. */
export class AssetStore {
  private readonly views = new Map<string, AssetView>();
  private readonly listeners = new Set<() => void>();
  private readonly helper: HelperConnection;

  /**
   * Bind the store to one helper connection.
   */
  constructor(helper: HelperConnection) {
    this.helper = helper;
  }

  /** Subscribe for `useSyncExternalStore`. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The current view of image `path` (in the notes folder), if it was asked for. */
  get(path: string): AssetView | undefined {
    return this.views.get(path);
  }

  /** Start loading image `path` unless it is loaded, loading, or failed. */
  request(path: string): void {
    const view = this.views.get(path);
    if (view) {
      this.views.delete(path);
      this.views.set(path, view);
      return;
    }
    this.set(path, { status: "loading" });
    void this.load(path);
  }

  /** Load image `path` again after a failure. */
  retry(path: string): void {
    if (this.views.get(path)?.status !== "error") return;
    this.views.delete(path);
    this.request(path);
  }

  /**
   * Save `file` as a new image of page `page` and keep it loaded. Rejects
   * with a readable message for files that are not images or are too large.
   */
  async save(page: string, file: File): Promise<SavedAsset> {
    const name = imageFileName(file);
    if (name === null) throw new Error(`"${file.name}" is not a PNG, JPEG, GIF, WebP, AVIF, BMP, or SVG image.`);
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Images larger than 16 MiB cannot be added.");
    const data = toBase64(new Uint8Array(await file.arrayBuffer()));
    const saved = await this.helper.request(
      "writeAsset",
      { page, name, data },
      parseSavedAsset,
      ASSET_TIMEOUT_MS,
    );
    this.set(saved.path, { status: "ready", url: URL.createObjectURL(file) });
    return saved;
  }

  /** Release every loaded image. */
  dispose(): void {
    for (const view of this.views.values()) {
      if (view.status === "ready") URL.revokeObjectURL(view.url);
    }
    this.views.clear();
  }

  /**
   * Read image `path` chunk by chunk and publish it as an object URL.
   */
  private async load(path: string): Promise<void> {
    try {
      const parts: Uint8Array<ArrayBuffer>[] = [];
      let offset = 0;
      let size = 0;
      let mime = "";
      do {
        const chunk = await this.helper.request(
          "readAsset",
          { path, offset },
          parseChunk,
          ASSET_TIMEOUT_MS,
        );
        const bytes = fromBase64(chunk.data);
        if (offset > 0 && (chunk.size !== size || chunk.mime !== mime)) {
          throw new Error("The image changed while it was read.");
        }
        ({ size, mime } = chunk);
        if (bytes.length === 0 && offset < size) throw new Error("The image file is shorter than expected.");
        parts.push(bytes);
        offset += bytes.length;
      } while (offset < size);
      if (this.views.get(path)?.status !== "loading") return;
      this.set(path, { status: "ready", url: URL.createObjectURL(new Blob(parts, { type: mime })) });
    } catch (error) {
      if (this.views.get(path)?.status !== "loading") return;
      this.set(path, { status: "error", message: messageOf(error) });
    }
  }

  /**
   * Replace the view of `path` as the most recently used, release images
   * beyond the cache size, and notify subscribers.
   */
  private set(path: string, view: AssetView): void {
    const old = this.views.get(path);
    if (old?.status === "ready" && (view.status !== "ready" || view.url !== old.url)) {
      URL.revokeObjectURL(old.url);
    }
    this.views.delete(path);
    this.views.set(path, view);
    for (const [key, cached] of this.views) {
      if (this.views.size <= MAX_CACHED) break;
      if (cached.status === "loading") continue;
      if (cached.status === "ready") URL.revokeObjectURL(cached.url);
      this.views.delete(key);
    }
    for (const listener of this.listeners) listener();
  }
}

/** The asset store of the open notes folder, for image blocks. */
export const AssetContext = createContext<AssetStore | null>(null);
