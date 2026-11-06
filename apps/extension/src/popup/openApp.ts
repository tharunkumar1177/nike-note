/**
 * Opens the Quire app page, or focuses it when a tab already shows it.
 */

/** Path of the app page inside the extension. */
export const APP_PATH = "app.html";

/**
 * True when a context URL is the app page, ignoring any query or hash.
 */
export function isAppUrl(documentUrl: string | undefined, appUrl: string): boolean {
  if (!documentUrl) return false;
  try {
    const actual = new URL(documentUrl);
    const expected = new URL(appUrl);
    return actual.origin === expected.origin && actual.pathname === expected.pathname;
  } catch {
    return false;
  }
}

/**
 * Focus the existing app tab and its window, or open a new tab.
 */
export async function openOrFocusApp(): Promise<void> {
  const appUrl = chrome.runtime.getURL(APP_PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
  const existing = contexts.find(
    (context) => context.tabId >= 0 && isAppUrl(context.documentUrl, appUrl),
  );

  if (existing) {
    await chrome.tabs.update(existing.tabId, { active: true });
    if (existing.windowId >= 0) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: appUrl });
}
