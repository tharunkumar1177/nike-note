/**
 * End-to-end tests for Visual blocks: a link line to an HTML file in the
 * page's assets runs as an interactive page in the extension's sandbox, cut
 * off from the extension's APIs and the network, and fits its content's
 * height; `/visual` adds one from pasted HTML or an uploaded file, and its
 * Generate with AI choice sends the request with the saved key.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

/** A key the provider refuses. */
const INVALID_KEY = "quire-e2e-invalid-key";

/** The provider's refusal as the user should read it: plain text, not a JSON body. */
const REFUSAL = /^[^{}]*API key[^{}]*$/i;

/**
 * A 500-pixel-tall visual with a Step button, which reports whether it can
 * reach the extension's APIs, its parent page, and the network.
 */
const PROBE = `<!doctype html>
<html>
<head><style>body { margin: 0; font: 16px sans-serif; } #box { height: 500px; }</style></head>
<body>
<div id="box">
  <button id="step">Step</button>
  <p id="count">0</p>
  <p id="api"></p>
  <p id="parent"></p>
  <p id="net">pending</p>
</div>
<script>
  document.getElementById("step").addEventListener("click", function () {
    var count = document.getElementById("count");
    count.textContent = String(Number(count.textContent) + 1);
  });
  var api = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
  document.getElementById("api").textContent = api ? "extension" : "isolated";
  var parentText;
  try { parentText = window.parent.document.title; } catch (error) { parentText = "blocked"; }
  document.getElementById("parent").textContent = parentText;
  fetch("https://example.com/").then(
    function () { document.getElementById("net").textContent = "online"; },
    function () { document.getElementById("net").textContent = "offline"; }
  );
</script>
</body>
</html>
`;

test("a visual runs in the sandbox, fits its height, and reloads from disk", async ({
  openApp,
  sandbox,
}) => {
  const notes = await createNotes(sandbox, {
    "README.md": "# Git\r\n\r\n[Merge vs rebase](assets/merge.html)\r\nAfter\r\n",
    "assets/merge.html": PROBE,
  });
  const app = await openApp();
  const figure = app.getByRole("figure", { name: "Visual: Merge vs rebase" });
  await expect(figure).toBeVisible();
  const frame = figure.frameLocator('iframe[title="Merge vs rebase"]');

  await expect(frame.locator("#api")).toHaveText("isolated");
  await expect(frame.locator("#parent")).toHaveText("blocked");
  await expect(frame.locator("#net")).toHaveText("offline");
  await frame.getByRole("button", { name: "Step" }).click();
  await frame.getByRole("button", { name: "Step" }).click();
  await expect(frame.locator("#count")).toHaveText("2");
  await expect(figure.locator("iframe")).toHaveCSS("height", "500px");
  await expect(app.getByRole("textbox", { name: "Edit block" })).toHaveCount(0);

  await writeFile(join(notes, "assets", "merge.html"), PROBE.replace("Step", "Next"));
  await figure.getByRole("button", { name: "Reload" }).click();
  await expect(frame.getByRole("button", { name: "Next" })).toBeVisible();
  await expect(frame.locator("#count")).toHaveText("0");

  await figure.getByText("Merge vs rebase", { exact: true }).click();
  await expect(app.getByRole("textbox", { name: "Edit block" })).toHaveValue(
    "[Merge vs rebase](assets/merge.html)",
  );
  expect(await readFile(join(notes, "README.md"), "utf8")).toBe(
    "# Git\r\n\r\n[Merge vs rebase](assets/merge.html)\r\nAfter\r\n",
  );
});

test("/visual previews pasted HTML and inserts it as a file and a link line", async ({
  openApp,
  sandbox,
}) => {
  const notes = await createNotes(sandbox, { "README.md": "# Git\n\nIntro\n" });
  const app = await openApp();
  await app.getByText("Intro", { exact: true }).click();
  await app.keyboard.press("End");
  await app.keyboard.press("Enter");
  await app.keyboard.type("/visual");
  await app.keyboard.press("Enter");

  const dialog = app.getByRole("dialog", { name: "Add a visual" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Generate with AI" })).toBeChecked();
  await expect(dialog.getByRole("button", { name: "Set up AI" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Insert" })).toBeDisabled();

  await dialog.getByRole("textbox", { name: "Title" }).fill("Merge vs rebase");
  await dialog.getByRole("radio", { name: "Paste HTML" }).check();
  await dialog.getByRole("textbox", { name: "HTML" }).fill(PROBE);
  const previewFrame = dialog.locator('iframe[title="Preview: Merge vs rebase"]');
  await expect(previewFrame).toHaveCSS("height", "500px");
  const preview = previewFrame.contentFrame();
  await preview.getByRole("button", { name: "Step" }).click();
  await expect(preview.locator("#count")).toHaveText("1");

  await dialog.getByRole("button", { name: "Insert" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => readFile(join(notes, "README.md"), "utf8"))
    .toBe("# Git\n\nIntro\n[Merge vs rebase](assets/Merge%20vs%20rebase.html)\n");
  expect(await readFile(join(notes, "assets", "Merge vs rebase.html"), "utf8")).toBe(PROBE.trim());
  const figure = app.getByRole("figure", { name: "Visual: Merge vs rebase" });
  await expect(figure.frameLocator("iframe").locator("#api")).toHaveText("isolated");
});

test("/visual uploads an HTML file and generates with the saved key", async ({
  openApp,
  sandbox,
}) => {
  const notes = await createNotes(sandbox, { "README.md": "# Git\n\nIntro\n" });
  const app = await openApp();
  await expect(app.getByRole("button", { name: "Set up AI" })).toBeEnabled();
  const settings = { provider: "gemini", model: "gemini-2.5-flash", key: INVALID_KEY };
  await app.evaluate(`chrome.storage.local.set({ ai: ${JSON.stringify(settings)} })`);
  await expect(app.getByRole("button", { name: "AI settings" })).toBeVisible();

  await app.getByText("Intro", { exact: true }).click();
  await app.keyboard.press("End");
  await app.keyboard.press("Enter");
  await app.keyboard.type("/visual");
  await app.keyboard.press("Enter");
  const dialog = app.getByRole("dialog", { name: "Add a visual" });
  const request = dialog.getByRole("textbox", { name: "Concept to explain" });
  await request.fill("Git merge vs rebase");
  await request.press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText(REFUSAL, { timeout: 30_000 });
  await expect(dialog.getByRole("button", { name: "Insert" })).toBeDisabled();

  await dialog.getByRole("radio", { name: "Upload file" }).check();
  await dialog.getByLabel("HTML file").setInputFiles({
    name: "Rebase steps.html",
    mimeType: "text/html",
    buffer: Buffer.from(PROBE),
  });
  await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue("Rebase steps");
  await expect(
    dialog.frameLocator('iframe[title="Preview: Rebase steps"]').locator("#count"),
  ).toHaveText("0");
  await dialog.getByRole("button", { name: "Insert" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => readFile(join(notes, "README.md"), "utf8"))
    .toBe("# Git\n\nIntro\n[Rebase steps](assets/Rebase%20steps.html)\n");
  expect(await readFile(join(notes, "assets", "Rebase steps.html"), "utf8")).toBe(PROBE);
});
