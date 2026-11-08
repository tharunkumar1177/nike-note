/**
 * End-to-end tests for settings: theme, page font, and full width apply at
 * once, last across reloads, and reach other extension pages; the keyboard
 * shortcut reference opens from settings and with Ctrl+/.
 */
import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

/** Expression for the page background color. */
const BACKGROUND = "getComputedStyle(document.body).backgroundColor";

/** Expression for the page text's font family. */
const PAGE_FONT = 'getComputedStyle(document.querySelector(".page__content")).fontFamily';

/** Expression for the width of the page text column, in pixels. */
const PAGE_WIDTH = 'document.querySelector(".page__content").getBoundingClientRect().width';

test("appearance settings apply at once and are kept", async ({
  openApp,
  sandbox,
  context,
  extensionUrl,
}) => {
  await createNotes(sandbox, { "README.md": "# Trip\nIntro\n" });
  const app = await openApp();
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Trip");
  expect(await app.evaluate(BACKGROUND)).toBe("rgb(255, 255, 255)");
  expect(await app.evaluate(PAGE_WIDTH)).toBeLessThanOrEqual(708);

  await app.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = app.getByRole("dialog", { name: "Settings" });
  await expect(dialog.getByRole("radio", { name: "System" })).toBeChecked();
  await dialog.getByRole("radio", { name: "Dark" }).check();
  await expect(app.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await app.evaluate(BACKGROUND)).toBe("rgb(25, 25, 25)");

  await dialog.getByRole("radio", { name: "Serif" }).check();
  expect(await app.evaluate(PAGE_FONT)).toContain("Georgia");
  await dialog.getByRole("switch", { name: /Full width/ }).check();
  expect(await app.evaluate(PAGE_WIDTH)).toBeGreaterThan(708);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  const popup = await context.newPage();
  await popup.goto(extensionUrl("popup.html"));
  await expect(popup.locator("html")).toHaveAttribute("data-theme", "dark");

  await app.reload();
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Trip");
  await expect(app.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(app.locator("html")).toHaveAttribute("data-font", "serif");
  await expect(app.locator("html")).toHaveAttribute("data-full-width", "");

  await app.getByRole("button", { name: "Settings", exact: true }).click();
  await dialog.getByRole("radio", { name: "Light" }).check();
  await expect(popup.locator("html")).toHaveAttribute("data-theme", "light");
  await dialog.getByRole("radio", { name: "System" }).check();
  await dialog.getByRole("radio", { name: "Default" }).check();
  await dialog.getByRole("switch", { name: /Full width/ }).uncheck();
  await expect(app.locator("html")).not.toHaveAttribute("data-theme");
  await expect(app.locator("html")).not.toHaveAttribute("data-font");
  await expect(app.locator("html")).not.toHaveAttribute("data-full-width");
  expect(await app.evaluate(PAGE_WIDTH)).toBeLessThanOrEqual(708);
});

test("the shortcut reference opens with Ctrl+/ and from settings", async ({
  openApp,
  sandbox,
}) => {
  await createNotes(sandbox, { "README.md": "# Trip\nIntro\n" });
  const app = await openApp();
  await expect(app.getByRole("tree", { name: "Pages" })).toBeVisible();

  await app.keyboard.press("Control+/");
  const shortcuts = app.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(shortcuts).toBeVisible();
  const general = shortcuts.getByRole("region", { name: "General" });
  await expect(general.getByRole("listitem").filter({ hasText: "Search pages" })).toContainText(
    "CtrlKorCtrlP",
  );
  await expect(shortcuts.getByRole("region", { name: "Text" })).toContainText("Strikethrough");
  await app.keyboard.press("Escape");
  await expect(shortcuts).toBeHidden();

  await app.getByText("Intro", { exact: true }).click();
  await expect(app.getByRole("textbox", { name: "Edit block" })).toBeFocused();
  await app.keyboard.press("Control+/");
  await expect(shortcuts).toBeVisible();
  await shortcuts.getByRole("button", { name: "Done" }).click();
  await expect(shortcuts).toBeHidden();

  await app.getByRole("button", { name: "Settings", exact: true }).click();
  await app.getByRole("button", { name: "Show shortcuts" }).click();
  await expect(app.getByRole("dialog", { name: "Settings" })).toBeHidden();
  await expect(shortcuts).toBeVisible();
});
