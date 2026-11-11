/**
 * End-to-end tests for page operations: adding, renaming, moving, and
 * deleting pages from the sidebar, renaming from the page title, and the
 * folders, link lines, and relative links the helper rewrites on disk.
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

let notes = "";

/** The text of `path` in the notes folder. */
function read(path: string): Promise<string> {
  return readFile(join(notes, path), "utf8");
}

/** True while `path` exists in the notes folder. */
async function exists(path: string): Promise<boolean> {
  return stat(join(notes, path)).then(
    () => true,
    () => false,
  );
}

/** The sidebar row of the page titled `title`. */
function row(app: Page, title: string) {
  return app
    .getByRole("tree", { name: "Pages" })
    .getByRole("treeitem", { name: title, exact: true });
}

/** Choose `item` from the menu of the row titled `title`. */
async function choose(app: Page, title: string, item: string) {
  await row(app, title).hover();
  await row(app, title).getByRole("button", { name: `Actions for ${title}` }).click();
  await app.getByRole("menu", { name: "Page" }).getByRole("menuitem", { name: item }).click();
}

test("renaming from the sidebar renames the folder and its link line", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, {
    "README.md": "# Home\n[Untitled](Untitled/README.md)\nsee [it](Untitled/README.md#top)\n",
    "Untitled/README.md": "# Untitled\nbody\n",
  });
  const app = await openApp();
  await row(app, "Untitled").click();
  await expect(app).toHaveURL(/#\/Untitled$/);

  await choose(app, "Untitled", "Rename");
  const box = app.getByRole("textbox", { name: "Page title" });
  await expect(box).toBeFocused();
  await box.fill("Trip plans");
  await box.press("Enter");

  await expect(app).toHaveURL(/#\/Trip%20plans$/);
  await expect(row(app, "Trip plans")).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => read("Trip plans/README.md")).toBe("# Trip plans\nbody\n");
  expect(await read("README.md")).toBe(
    "# Home\n[Trip plans](Trip%20plans/README.md)\nsee [it](Trip%20plans/README.md#top)\n",
  );
  expect(await exists("Untitled")).toBe(false);
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Trip plans");
});

test("a page added from the sidebar takes its folder name from the typed title", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, { "README.md": "# Home\n" });
  const app = await openApp();
  await row(app, "Home").hover();
  await row(app, "Home").getByRole("button", { name: "Add a page inside Home" }).click();
  await expect(app).toHaveURL(/#\/Untitled$/);
  expect(await read("README.md")).toBe("# Home\n[Untitled](Untitled/README.md)\n");

  await app.getByRole("heading", { level: 1, name: "Untitled" }).click();
  const title = app.getByRole("textbox", { name: "Page title" });
  await title.press("Control+a");
  await title.pressSequentially("Ideas");
  await app.locator(".page-bar").click();

  await expect(app).toHaveURL(/#\/Ideas$/);
  await expect.poll(() => read("README.md")).toBe("# Home\n[Ideas](Ideas/README.md)\n");
  expect(await read("Ideas/README.md")).toBe("# Ideas\n");
});

test("moving a page through the dialog and by dragging keeps links working", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, {
    "README.md": "# Home\n[A](A/README.md)\n[B](B/README.md)\n",
    "A/README.md": "# A\nsee [B](../B/README.md)\n",
    "B/README.md": "# B\nup [home](../README.md)\n",
  });
  const app = await openApp();
  await row(app, "B").click();

  await choose(app, "B", "Move to…");
  const dialog = app.getByRole("dialog", { name: "Move “B” to" });
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await expect(dialog.getByRole("option")).toContainText("A");
  await dialog.getByRole("combobox", { name: "Find a page" }).fill("a");
  await app.keyboard.press("Enter");

  await expect(app).toHaveURL(/#\/A\/B$/);
  await expect
    .poll(() => read("A/README.md"))
    .toBe("# A\nsee [B](B/README.md)\n[B](B/README.md)\n");
  expect(await read("README.md")).toBe("# Home\n[A](A/README.md)\n");
  expect(await read("A/B/README.md")).toBe("# B\nup [home](../../README.md)\n");

  await row(app, "B").dragTo(row(app, "Home"));
  await expect(app).toHaveURL(/#\/B$/);
  await expect
    .poll(() => read("README.md"))
    .toBe("# Home\n[A](A/README.md)\n[B](B/README.md)\n");
  expect(await read("A/README.md")).toBe("# A\nsee [B](../B/README.md)\n");
  expect(await read("B/README.md")).toBe("# B\nup [home](../README.md)\n");
});

test("deleting a page asks first, then removes it and its link line", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, {
    "README.md": "# Home\n[Old](Old/README.md)\nkeep\n",
    "Old/README.md": "# Old\n",
    "Old/Sub/README.md": "# Sub\n",
  });
  const app = await openApp();
  await row(app, "Old").click();
  await row(app, "Old").press("Delete");

  const dialog = app.getByRole("dialog", { name: "Delete “Old”?" });
  await expect(dialog).toContainText("its sub-page");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(await exists("Old")).toBe(true);

  await choose(app, "Old", "Delete");
  await app.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(app).toHaveURL(/#\/$/);
  await expect(row(app, "Old")).toHaveCount(0);
  await expect.poll(() => exists("Old")).toBe(false);
  expect(await read("README.md")).toBe("# Home\nkeep\n");
});
