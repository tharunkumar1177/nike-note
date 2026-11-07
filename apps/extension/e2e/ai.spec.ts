/**
 * End-to-end tests for AI setup and page summaries. CI has no provider key,
 * so these run the real Gemini SDK against the real API with an invalid key
 * and check that its refusal reaches the user, which also proves the SDK
 * chunk loads lazily inside the extension.
 */
import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

/** A key the provider refuses. */
const INVALID_KEY = "quire-e2e-invalid-key";

/** Expression that reads the saved AI settings in the app page. */
const READ_SETTINGS = 'chrome.storage.local.get("ai")';

test("summarizing before setup opens AI setup, which reports a refused key", async ({
  openApp,
  sandbox,
}) => {
  await createNotes(sandbox, { "README.md": "# Trip\n- Book the hotel\n" });
  const app = await openApp();
  await app.getByRole("button", { name: "Summarize" }).click();

  const dialog = app.getByRole("dialog", { name: "Set up AI" });
  await expect(dialog).toContainText("only when you run an AI action");
  await expect(dialog.getByRole("combobox", { name: "Provider" })).toHaveValue("gemini");
  const check = dialog.getByRole("button", { name: "Check key" });
  await expect(check).toBeDisabled();
  await dialog.getByLabel("API key").fill(INVALID_KEY);
  await check.click();
  await expect(dialog.getByRole("alert")).toContainText(/API key/i, { timeout: 30_000 });
  await expect(dialog.getByRole("button", { name: "Save" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(await app.evaluate(READ_SETTINGS)).toEqual({});
});

test("a saved key is used for summaries and can be removed", async ({ openApp, sandbox }) => {
  await createNotes(sandbox, { "README.md": "# Trip\n- Book the hotel\n" });
  const app = await openApp();
  await expect(app.getByRole("button", { name: "Set up AI" })).toBeEnabled();
  const settings = { provider: "gemini", model: "gemini-2.5-flash", key: INVALID_KEY };
  await app.evaluate(`chrome.storage.local.set({ ai: ${JSON.stringify(settings)} })`);
  await expect(app.getByRole("button", { name: "AI settings" })).toBeVisible();

  await app.getByRole("button", { name: "Summarize" }).click();
  const summary = app.getByRole("dialog", { name: "Summary of “Trip”" });
  await expect(summary).toContainText("gemini-2.5-flash");
  await expect(summary.getByRole("alert")).toContainText(/API key/i, { timeout: 30_000 });
  await expect(summary.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(summary.getByRole("button", { name: "Copy" })).toBeDisabled();
  await summary.getByRole("button", { name: "Done" }).click();
  await expect(summary).toBeHidden();

  await app.getByRole("button", { name: "AI settings" }).click();
  const setup = app.getByRole("dialog", { name: "Set up AI" });
  await expect(setup.getByLabel("API key")).toHaveValue(INVALID_KEY);
  await expect(setup.getByRole("combobox", { name: "Model" })).toHaveValue("gemini-2.5-flash");
  await setup.getByRole("button", { name: "Remove key" }).click();
  await expect(setup).toBeHidden();
  await expect(app.getByRole("button", { name: "Set up AI" })).toBeVisible();
  expect(await app.evaluate(READ_SETTINGS)).toEqual({});
});
