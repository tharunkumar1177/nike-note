/**
 * End-to-end tests for block keyboard behavior: Markdown shortcuts while
 * typing, markers hidden while editing, Tab nesting, Backspace removing a
 * block's type, and moving between blocks with the arrow keys.
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

test("shortcuts turn typed lines into headings, lists, to-dos, quotes, and dividers", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, { "README.md": "# Plans\n\nFirst line\n" });
  const app = await openApp();
  await expect(app.getByText("First line", { exact: true })).toBeVisible();
  await app.locator(".page__tail").click();
  const box = app.getByRole("textbox", { name: "Edit block" });

  await app.keyboard.type("## Heading two");
  await expect(box).toHaveValue("Heading two");
  await expect(app.locator(".block--editing")).toHaveClass(/block--h2/);
  await app.keyboard.press("Enter");
  await app.keyboard.type("- apple");
  await expect(box).toHaveValue("apple");
  await app.keyboard.press("Enter");
  await expect(box).toHaveValue("");
  await expect(box).toHaveAttribute("placeholder", "List");
  await app.keyboard.press("Enter");
  await app.keyboard.type("[] buy");
  await expect(app.locator(".block--editing .block__checkbox")).not.toBeChecked();
  await app.keyboard.press("Control+Enter");
  await expect(app.locator(".block--editing .block__checkbox")).toBeChecked();
  await app.keyboard.press("Enter");
  await app.keyboard.press("Backspace");
  await expect(box).toHaveAttribute("placeholder", /heading/);
  await app.keyboard.type('" quoted');
  await expect(app.locator(".block--editing")).toHaveClass(/block--quote/);
  await app.keyboard.press("Enter");
  await app.keyboard.type("---");
  await expect(app.locator(".block--divider")).toHaveCount(1);

  await expect
    .poll(readme)
    .toBe("# Plans\n\nFirst line\n## Heading two\n- apple\n- [x] buy\n> quoted\n---\n\n");
});

test("Tab nests list items and Shift+Tab moves them back out", async ({ openApp, sandbox }) => {
  notes = await createNotes(sandbox, { "README.md": "# T\n\n- one\n- two\n" });
  const app = await openApp();
  await app.getByText("two", { exact: true }).click();
  await app.keyboard.press("Tab");
  await expect.poll(readme).toBe("# T\n\n- one\n  - two\n");
  await expect(app.getByRole("textbox", { name: "Edit block" })).toHaveValue("two");
  await app.keyboard.press("Shift+Tab");
  await expect.poll(readme).toBe("# T\n\n- one\n- two\n");
});

test("Backspace removes a block's type, then joins it to the line before", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, { "README.md": "# T\n\nIntro\n## Sub\n" });
  const app = await openApp();
  await app.getByText("Sub", { exact: true }).click();
  await app.keyboard.press("Home");
  await app.keyboard.press("Backspace");
  await expect.poll(readme).toBe("# T\n\nIntro\nSub\n");
  await app.keyboard.press("Backspace");
  await expect.poll(readme).toBe("# T\n\nIntroSub\n");
});

test("Up and Down keep the caret in the same place in the text", async ({ openApp, sandbox }) => {
  notes = await createNotes(sandbox, { "README.md": "# T\n\n- alpha\n1. beta\n" });
  const app = await openApp();
  await app.getByText("beta", { exact: true }).click();
  await app.keyboard.press("ArrowUp");
  await app.keyboard.type("!");
  await expect.poll(readme).toBe("# T\n\n- alph!a\n1. beta\n");
  await app.keyboard.press("ArrowDown");
  await app.keyboard.type("?");
  await expect.poll(readme).toBe("# T\n\n- alph!a\n1. beta?\n");
});
