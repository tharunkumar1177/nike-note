/**
 * End-to-end tests for editing and autosave against the real helper: unchanged
 * lines stay byte for byte, changes made outside Quire show up while a page is
 * open, and a conflicting change on disk is never overwritten silently.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

/** A home page with a byte order mark, Windows line endings, and spacing that must survive. */
const HOME = "\uFEFF# Plans\r\n\r\nFirst line\r\n- Pack\r\n```\r\nkeep   this\r\n```\r\n";

let notes = "";

test.beforeEach(async ({ sandbox }) => {
  notes = await createNotes(sandbox, { "README.md": HOME, "Trip/README.md": "# Trip\n" }, ["Ideas"]);
});

/** Read a README.md from the notes folder, or "" when it does not exist. */
function readme(...folders: string[]): Promise<string> {
  return readFile(join(notes, ...folders, "README.md"), "utf8").catch(() => "");
}

test("edits are saved and unchanged lines stay byte for byte", async ({ openApp }) => {
  const app = await openApp();
  await app.getByText("First line", { exact: true }).click();
  const box = app.getByRole("textbox", { name: "Edit block" });
  await expect(box).toHaveValue("First line");
  await box.pressSequentially(", edited");
  await expect
    .poll(() => readme())
    .toBe("\uFEFF# Plans\r\n\r\nFirst line, edited\r\n- Pack\r\n```\r\nkeep   this\r\n```\r\n");
  await expect(app.locator(".save-status")).toHaveText("Saved");
});

test("Enter continues a list and the title renames the page", async ({ openApp }) => {
  const app = await openApp();
  await app.getByText("Pack", { exact: true }).click();
  await app.getByRole("textbox", { name: "Edit block" }).press("Enter");
  await expect(app.getByRole("textbox", { name: "Edit block" })).toHaveValue("- ");
  await app.keyboard.type("Fly");

  await app.getByRole("heading", { level: 1 }).click();
  const title = app.getByRole("textbox", { name: "Page title" });
  await expect(title).toHaveValue("Plans");
  await title.press("End");
  await app.keyboard.type(" 2027");
  await expect
    .poll(() => readme())
    .toBe("\uFEFF# Plans 2027\r\n\r\nFirst line\r\n- Pack\r\n- Fly\r\n```\r\nkeep   this\r\n```\r\n");
  await expect(app.getByRole("treeitem", { name: "Plans 2027" })).toBeVisible();
});

test("changes made outside Quire appear while the page is open", async ({ openApp }) => {
  const app = await openApp();
  await expect(app.getByText("First line", { exact: true })).toBeVisible();
  await writeFile(join(notes, "README.md"), "# Plans\n\nChanged elsewhere\n");
  await expect(app.getByText("Changed elsewhere", { exact: true })).toBeVisible();
  await expect(app.getByText("First line", { exact: true })).toHaveCount(0);
});

test("a conflicting change on disk asks which version to keep", async ({ openApp }) => {
  const app = await openApp();
  await app.getByText("First line", { exact: true }).click();
  await app.getByRole("textbox", { name: "Edit block" }).pressSequentially(" mine");
  await writeFile(join(notes, "README.md"), "# Plans\n\nTheirs\n");

  const conflict = app.getByRole("alert").filter({ hasText: "changed on disk" });
  await expect(conflict).toBeVisible();
  await expect(app.locator(".save-status")).toHaveText("Not saved");
  expect(await readme()).toBe("# Plans\n\nTheirs\n");
  await conflict.getByRole("button", { name: "Keep my version" }).click();
  await expect.poll(() => readme()).toContain("First line mine\r\n");
  await expect(conflict).toHaveCount(0);
});

test("writing on a page without README.md creates it", async ({ openApp }) => {
  const app = await openApp();
  await app.getByRole("treeitem", { name: "Ideas" }).click();
  await app.getByText("Click here, or press Enter in the title, to start writing.").click();
  await app.keyboard.type("Start small");
  await expect.poll(() => readme("Ideas")).toBe("Start small\n");
  await expect(app.getByText("This page has no README.md yet.", { exact: false })).toHaveCount(0);
});
