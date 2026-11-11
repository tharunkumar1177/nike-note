/**
 * End-to-end tests for inline formatting: the toolbar over a selection, its
 * pressed states, the keyboard shortcuts, styles at a caret, and the link
 * address form.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

let notes = "";

/** The notes folder's home README.md. */
function readme(): Promise<string> {
  return readFile(join(notes, "README.md"), "utf8");
}

test("the toolbar styles a selection and shows which styles are on", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, { "README.md": "# T\n\nmake this bold\n" });
  const app = await openApp();
  await app.getByText("make this bold", { exact: true }).click();
  await app.keyboard.press("End");
  for (let step = 0; step < 4; step += 1) await app.keyboard.press("Shift+ArrowLeft");
  const toolbar = app.getByRole("toolbar", { name: "Format" });
  await expect(toolbar).toBeVisible();
  const bold = toolbar.getByRole("button", { name: "Bold" });
  await expect(bold).toHaveAttribute("aria-pressed", "false");

  await bold.click();
  await expect.poll(readme).toBe("# T\n\nmake this **bold**\n");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(app.getByRole("textbox", { name: "Edit block" })).toBeFocused();

  await app.keyboard.press("Control+i");
  await expect.poll(readme).toBe("# T\n\nmake this **_bold_**\n");
  await expect(toolbar.getByRole("button", { name: "Italic" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await bold.click();
  await expect.poll(readme).toBe("# T\n\nmake this _bold_\n");
  await expect(bold).toHaveAttribute("aria-pressed", "false");
});

test("Ctrl+K links the selection to a typed address", async ({ openApp, sandbox }) => {
  notes = await createNotes(sandbox, { "README.md": "# T\n\nread the docs\n" });
  const app = await openApp();
  await app.getByText("read the docs", { exact: true }).click();
  await app.keyboard.press("End");
  for (let step = 0; step < 4; step += 1) await app.keyboard.press("Shift+ArrowLeft");
  await app.keyboard.press("Control+k");
  const address = app.getByRole("textbox", { name: "Link address" });
  await expect(address).toBeFocused();
  await address.fill("example.com");
  await address.press("Enter");
  await expect.poll(readme).toBe("# T\n\nread the [docs](https://example.com)\n");
  await expect(app.getByRole("textbox", { name: "Edit block" })).toBeFocused();

  await app.keyboard.press("Control+k");
  await expect(address).toHaveValue("https://example.com");
  await app.getByRole("toolbar", { name: "Format" }).getByRole("button", { name: "Remove" }).click();
  await expect.poll(readme).toBe("# T\n\nread the docs\n");
});

test("shortcuts at a caret start a style and step out of it", async ({ openApp, sandbox }) => {
  notes = await createNotes(sandbox, { "README.md": "# T\n\nIntro\n" });
  const app = await openApp();
  await app.getByText("Intro", { exact: true }).click();
  await app.keyboard.press("End");
  await app.keyboard.type(" ");
  await app.keyboard.press("Control+b");
  await app.keyboard.type("x");
  await app.keyboard.press("Control+b");
  await app.keyboard.type(" y");
  await expect.poll(readme).toBe("# T\n\nIntro **x** y\n");
  await app.keyboard.press("Shift+ArrowLeft");
  await app.keyboard.press("Control+Shift+X");
  await expect.poll(readme).toBe("# T\n\nIntro **x** ~~y~~\n");
  await app.keyboard.press("Escape");
  await expect(app.locator(".blocks strong")).toHaveText("x");
  await expect(app.locator(".blocks s, .blocks del")).toHaveText("y");
});
