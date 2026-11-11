/**
 * End-to-end tests for editing tables like Notion: cells are edited in
 * place, the keyboard moves between them, the + bars add rows and columns,
 * and the row and column menus insert, move, align, and delete, while the
 * file stays a GitHub table that changes only where it was edited.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

/** A page with a hand-written table between two lines of text. */
const PAGE = "# Trip\n\nBefore\n\n|City|Nights|\n|---|--:|\n|Kyoto|3|\n\nAfter\n";

test("cells are edited in place and Tab adds a row at the end", async ({ openApp, sandbox }) => {
  const notes = await createNotes(sandbox, { "README.md": PAGE });
  const readme = () => readFile(join(notes, "README.md"), "utf8");
  const app = await openApp();
  const table = app.getByRole("table", { name: "Table" });
  await expect(table.getByRole("columnheader")).toHaveText(["City", "Nights"]);

  await table.getByRole("cell", { name: "3" }).click();
  const nights = table.getByRole("textbox", { name: "Row 1, column 2" });
  await expect(nights).toBeFocused();
  await expect(nights).toHaveValue("3");
  await app.keyboard.type("0");
  await expect.poll(readme).toBe(PAGE.replace("|Kyoto|3|", "| Kyoto | 30 |"));

  await app.keyboard.press("Shift+Tab");
  await expect(table.getByRole("textbox", { name: "Row 1, column 1" })).toBeFocused();
  await app.keyboard.type(" | Nara");
  await app.keyboard.press("Tab");
  await app.keyboard.press("Tab");
  const added = table.getByRole("textbox", { name: "Row 2, column 1" });
  await expect(added).toBeFocused();
  await app.keyboard.type("Osaka and more");
  await app.keyboard.press("Escape");
  await expect(added).toHaveCount(0);
  await expect
    .poll(readme)
    .toBe(
      "# Trip\n\nBefore\n\n|City|Nights|\n|---|--:|\n| Kyoto \\| Nara | 30 |\n| Osaka and more |  |\n\nAfter\n",
    );
  await expect(table.getByRole("cell").first()).toHaveText("Kyoto | Nara");
});

test("the arrow keys move between cells and out of the table", async ({ openApp, sandbox }) => {
  await createNotes(sandbox, { "README.md": PAGE });
  const app = await openApp();
  const table = app.getByRole("table", { name: "Table" });
  await table.getByRole("columnheader", { name: /City/ }).click();
  await expect(table.getByRole("textbox", { name: "Header 1" })).toBeFocused();
  await app.keyboard.press("ArrowRight");
  await expect(table.getByRole("textbox", { name: "Header 2" })).toBeFocused();
  await app.keyboard.press("ArrowDown");
  await expect(table.getByRole("textbox", { name: "Row 1, column 2" })).toBeFocused();
  await app.keyboard.press("ArrowDown");
  const line = app.getByRole("textbox", { name: "Edit block" });
  await expect(line).toBeFocused();
  await expect(line).toHaveValue("");
  await app.keyboard.press("ArrowDown");
  await expect(line).toHaveValue("After");
  await app.keyboard.press("ArrowUp");
  await app.keyboard.press("ArrowUp");
  await expect(table.getByRole("textbox", { name: "Row 1, column 1" })).toBeFocused();
  await app.keyboard.press("ArrowUp");
  await app.keyboard.press("ArrowUp");
  await expect(app.getByRole("textbox", { name: "Edit block" })).toBeFocused();
});

test("the + bars and the row and column menus change the table", async ({
  openApp,
  sandbox,
}) => {
  const notes = await createNotes(sandbox, { "README.md": PAGE });
  const readme = () => readFile(join(notes, "README.md"), "utf8");
  const app = await openApp();
  const table = app.getByRole("table", { name: "Table" });
  const block = app.locator(".table-editor");

  await block.hover();
  await block.getByRole("button", { name: "Add column" }).click();
  await expect(table.getByRole("textbox", { name: "Header 3" })).toBeFocused();
  await app.keyboard.type("Budget");
  await block.getByRole("button", { name: "Add row" }).click();
  await expect(table.getByRole("textbox", { name: "Row 2, column 1" })).toBeFocused();
  await app.keyboard.type("Osaka");
  await expect
    .poll(readme)
    .toBe(
      "# Trip\n\nBefore\n\n| City | Nights | Budget |\n| --- | ---: | --- |\n| Kyoto | 3 |  |\n| Osaka |  |  |\n\nAfter\n",
    );

  await block.getByRole("button", { name: "Column 3 actions" }).click();
  const columnMenu = app.getByRole("menu", { name: "Column 3" });
  await expect(columnMenu.getByRole("menuitemradio", { name: "Align left" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await columnMenu.getByRole("menuitemradio", { name: "Align center" }).click();
  await expect(columnMenu).toBeHidden();
  await block.getByRole("button", { name: "Column 3 actions" }).click();
  await app.getByRole("menu", { name: "Column 3" }).getByRole("menuitem", { name: "Move column left" }).click();
  await expect(table.getByRole("columnheader")).toHaveText(["City", "Budget", "Nights"]);

  await block.getByRole("button", { name: "Row 2 actions" }).click();
  await app.getByRole("menu", { name: "Row 2" }).getByRole("menuitem", { name: "Move row up" }).click();
  await expect(table.getByRole("cell").first()).toHaveText("Osaka");
  await block.getByRole("button", { name: "Row 2 actions" }).click();
  await app.getByRole("menu", { name: "Row 2" }).getByRole("menuitem", { name: "Delete row" }).click();
  await block.getByRole("button", { name: "Column 2 actions" }).click();
  await app.getByRole("menu", { name: "Column 2" }).getByRole("menuitem", { name: "Delete column" }).click();
  await expect
    .poll(readme)
    .toBe("# Trip\n\nBefore\n\n| City | Nights |\n| --- | ---: |\n| Osaka |  |\n\nAfter\n");

  await block.getByRole("button", { name: "Header row actions" }).click();
  const headerMenu = app.getByRole("menu", { name: "Header row" });
  await expect(headerMenu.getByRole("menuitem")).toHaveText(["Insert row below"]);
  await app.keyboard.press("Escape");
  await expect(headerMenu).toBeHidden();
});
