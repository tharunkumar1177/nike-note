/**
 * End-to-end tests for the block handle: its menu turning, duplicating,
 * moving, and deleting a block, dragging a block to a new place, and the
 * move and duplicate shortcuts while editing.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

let notes = "";

/** The notes folder's home README.md. */
function readme(): Promise<string> {
  return readFile(join(notes, "README.md"), "utf8");
}

/** The first shown block whose whole text is `text`. */
function slot(app: Page, text: string) {
  return app
    .locator(".block-slot")
    .filter({ has: app.getByText(text, { exact: true }) })
    .first();
}

/** Open the block menu of the block whose text is `text`. */
async function openMenu(app: Page, text: string) {
  const block = slot(app, text);
  await block.hover();
  await block.getByRole("button", { name: "Block actions" }).click();
  const menu = app.getByRole("menu", { name: "Block" });
  await expect(menu).toBeVisible();
  return menu;
}

test("the block menu turns, duplicates, moves, and deletes a block", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, { "README.md": "# T\nalpha\nbeta\n" });
  const app = await openApp();
  await expect(app.getByText("alpha", { exact: true })).toBeVisible();

  let menu = await openMenu(app, "alpha");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await menu.getByRole("menuitem", { name: "Heading 2" }).click();
  await expect.poll(readme).toBe("# T\n## alpha\nbeta\n");
  await expect(menu).toBeHidden();

  menu = await openMenu(app, "alpha");
  await menu.getByRole("menuitem", { name: /^Duplicate/ }).click();
  await expect.poll(readme).toBe("# T\n## alpha\n## alpha\nbeta\n");

  menu = await openMenu(app, "beta");
  await menu.getByRole("menuitem", { name: /^Move up/ }).click();
  await expect.poll(readme).toBe("# T\n## alpha\nbeta\n## alpha\n");

  menu = await openMenu(app, "beta");
  await app.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeFocused();
  await app.keyboard.press("Enter");
  await expect.poll(readme).toBe("# T\n## alpha\n## alpha\n");

  menu = await openMenu(app, "alpha");
  await app.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(slot(app, "alpha").getByRole("button", { name: "Block actions" })).toBeFocused();
});

test("a list item's menu indents it and moves it with its nested items", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, { "README.md": "# T\n- one\n- two\n  - deep\n" });
  const app = await openApp();
  await expect(app.getByText("one", { exact: true })).toBeVisible();

  let menu = await openMenu(app, "two");
  await menu.getByRole("menuitem", { name: /^Move up/ }).click();
  await expect.poll(readme).toBe("# T\n- two\n  - deep\n- one\n");

  menu = await openMenu(app, "one");
  await menu.getByRole("menuitem", { name: /^Indent/ }).click();
  await expect.poll(readme).toBe("# T\n- two\n  - deep\n  - one\n");
});

test("dragging the handle moves a block", async ({ openApp, sandbox }) => {
  notes = await createNotes(sandbox, { "README.md": "# T\nalpha\nbeta\ngamma\n" });
  const app = await openApp();
  await expect(app.getByText("gamma", { exact: true })).toBeVisible();

  const gamma = slot(app, "gamma");
  await gamma.hover();
  await gamma
    .getByRole("button", { name: "Block actions" })
    .dragTo(slot(app, "alpha"), { targetPosition: { x: 20, y: 2 } });
  await expect.poll(readme).toBe("# T\ngamma\nalpha\nbeta\n");
});

test("shortcuts move and duplicate the block being edited", async ({ openApp, sandbox }) => {
  notes = await createNotes(sandbox, { "README.md": "# T\nalpha\n- beta\n" });
  const app = await openApp();
  await app.getByText("beta", { exact: true }).click();
  await app.keyboard.press("End");

  await app.keyboard.press("Control+Shift+ArrowUp");
  await expect.poll(readme).toBe("# T\n- beta\nalpha\n");
  await app.keyboard.type("!");
  await expect.poll(readme).toBe("# T\n- beta!\nalpha\n");

  await app.keyboard.press("Control+d");
  await expect.poll(readme).toBe("# T\n- beta!\n- beta!\nalpha\n");
  await app.keyboard.press("Control+Shift+ArrowDown");
  await app.keyboard.type("?");
  await expect.poll(readme).toBe("# T\n- beta!\nalpha\n- beta!?\n");
});
