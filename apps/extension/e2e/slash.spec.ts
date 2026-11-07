/**
 * End-to-end tests for the slash menu: typing `/` lists the commands, the
 * query narrows them, the keyboard and the mouse pick one, and `/page` adds a
 * sub-page folder linked from the line.
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

let notes = "";

/** The notes folder's home README.md. */
function readme(): Promise<string> {
  return readFile(join(notes, "README.md"), "utf8");
}

test("the slash menu filters as you type and turns the line into the chosen block", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, { "README.md": "# Plans\n\nIntro\n" });
  const app = await openApp();
  await app.getByText("Intro", { exact: true }).click();
  await app.keyboard.press("End");
  await app.keyboard.press("Enter");
  const box = app.getByRole("textbox", { name: "Edit block" });
  const menu = app.getByRole("listbox", { name: "Blocks" });

  await app.keyboard.type("/");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(19);
  await app.keyboard.type("h2");
  await expect(menu.getByRole("option").first()).toHaveText(/Heading 2/);
  await expect(menu.getByRole("option", { selected: true })).toHaveText(/Heading 2/);
  await app.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(app.locator(".block--editing")).toHaveClass(/block--h2/);
  await app.keyboard.type("Week one");
  await expect.poll(readme).toBe("# Plans\n\nIntro\n## Week one\n");

  await app.keyboard.press("Enter");
  await app.keyboard.type("Pack /to");
  await app.keyboard.press("ArrowDown");
  await app.keyboard.press("ArrowUp");
  await app.keyboard.press("Tab");
  await expect(app.locator(".block--editing .block__checkbox")).toBeVisible();
  await expect(box).toHaveValue("Pack ");
  await expect.poll(readme).toBe("# Plans\n\nIntro\n## Week one\n- [ ] Pack \n");

  await app.keyboard.press("Enter");
  await app.keyboard.press("Backspace");
  await app.keyboard.type("/");
  await menu.getByRole("option", { name: /Divider/ }).click();
  await expect(app.locator(".block--divider")).toHaveCount(1);
  await expect.poll(readme).toBe("# Plans\n\nIntro\n## Week one\n- [ ] Pack \n---\n\n");
});

test("Escape, a space, or text with no match closes the menu and keeps the text", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, { "README.md": "# T\n\nIntro\n" });
  const app = await openApp();
  await app.getByText("Intro", { exact: true }).click();
  await app.keyboard.press("End");
  const menu = app.getByRole("listbox", { name: "Blocks" });

  await app.keyboard.type(" /");
  await expect(menu).toBeVisible();
  await app.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(app.getByRole("textbox", { name: "Edit block" })).toBeFocused();
  await app.keyboard.type(" /h");
  await expect(menu).toBeVisible();
  await app.keyboard.type(" ");
  await expect(menu).toBeHidden();
  await app.keyboard.type("/zzz");
  await expect(menu).toBeHidden();
  await app.keyboard.type(" a/b");
  await expect(menu).toBeHidden();
  await app.keyboard.press("Enter");
  await expect.poll(readme).toBe("# T\n\nIntro / /h /zzz a/b\n\n");
});

test("/page creates a sub-page folder, links it from the line, and opens it", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, { "README.md": "# Home\n\nIdeas\n" });
  const app = await openApp();
  await app.getByText("Ideas", { exact: true }).click();
  await app.keyboard.press("End");
  await app.keyboard.press("Enter");
  await app.keyboard.type("/page");
  await app.keyboard.press("Enter");

  await expect(app.getByRole("heading", { level: 1, name: "Untitled" })).toBeVisible();
  await expect(app).toHaveURL(/#\/Untitled$/);
  await expect.poll(readme).toBe("# Home\n\nIdeas\n[Untitled](Untitled/README.md)\n");
  expect((await stat(join(notes, "Untitled", "README.md"))).isFile()).toBe(true);
  expect(await readFile(join(notes, "Untitled", "README.md"), "utf8")).toBe("# Untitled\n");
  await expect(app.getByRole("navigation").getByText("Untitled")).not.toHaveCount(0);
});
