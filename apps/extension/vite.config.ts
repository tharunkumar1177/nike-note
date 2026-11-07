/**
 * Vite multi-page build for the extension: popup.html and app.html, plus the
 * generated manifest and icons.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { quireExtension } from "./src/build/plugin";

const root = fileURLToPath(new URL(".", import.meta.url));
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  root,
  plugins: [react(), quireExtension({ version })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome116",
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: {
        popup: fileURLToPath(new URL("./popup.html", import.meta.url)),
        app: fileURLToPath(new URL("./app.html", import.meta.url)),
      },
    },
  },
});
