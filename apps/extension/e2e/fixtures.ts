/**
 * Playwright fixtures: a persistent Chromium profile with the unpacked
 * extension loaded and, unless disabled, the real helper registered.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, test as base, type BrowserContext, type Page } from "@playwright/test";

import { EXTENSION_ID, HOST_NAME } from "../src/shared/identity";

const extensionDir = resolve(fileURLToPath(new URL("../dist", import.meta.url)));

/**
 * Absolute path of the helper binary built by CI.
 */
function helperBinary(): string {
  const path = process.env.QUIRE_HELPER_BINARY;
  if (!path) {
    throw new Error("Set QUIRE_HELPER_BINARY to the quire-helper binary built for this OS");
  }
  return resolve(path);
}

/**
 * Register the helper inside the profile. Chromium on Linux and macOS reads
 * per-user hosts from `<user data dir>/NativeMessagingHosts`.
 */
async function registerHelper(userDataDir: string): Promise<void> {
  const hostsDir = join(userDataDir, "NativeMessagingHosts");
  await mkdir(hostsDir, { recursive: true });
  const manifest = {
    name: HOST_NAME,
    description: "Quire Helper (end-to-end test registration)",
    path: helperBinary(),
    type: "stdio",
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
  };
  await writeFile(join(hostsDir, `${HOST_NAME}.json`), JSON.stringify(manifest, null, 2));
}

export const test = base.extend<{
  helperInstalled: boolean;
  context: BrowserContext;
  extensionUrl: (path: string) => string;
  openApp: () => Promise<Page>;
}>({
  helperInstalled: [true, { option: true }],

  context: async ({ helperInstalled }, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), "quire-e2e-"));
    if (helperInstalled) await registerHelper(userDataDir);
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
      ],
    });
    await use(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },

  // Playwright requires an object pattern for fixtures without dependencies.
  // eslint-disable-next-line no-empty-pattern
  extensionUrl: async ({}, use) => {
    await use((path) => `chrome-extension://${EXTENSION_ID}/${path}`);
  },

  openApp: async ({ context, extensionUrl }, use) => {
    await use(async () => {
      const page = await context.newPage();
      await page.goto(extensionUrl("app.html"));
      return page;
    });
  },
});

export { expect } from "@playwright/test";
