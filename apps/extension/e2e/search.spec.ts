/**
 * End-to-end tests for quick search: the helper finds pages by title and
 * text, the dialog highlights matches and shows where each page lives, and
 * the keyboard opens, moves through, and picks results.
 */
import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

test("searching opens the chosen page from the keyboard", async ({ openApp, sandbox }) => {
  await createNotes(sandbox, {
    "README.md": "# Home\n- [ ] Plan the Kyoto trip\n",
    "Trips/README.md": "# Trips\n",
    "Trips/Kyoto/README.md": "# Kyoto\n\nTemples and a day trip to Nara\n",
    "Trips/Rome/README.md": "# Rome\nKyoto next year\n",
    ".git-notes/README.md": "# Kyoto hidden\n",
  });
  const app = await openApp();
  await expect(app.getByRole("tree", { name: "Pages" })).toBeVisible();

  await app.keyboard.press("Control+k");
  const dialog = app.getByRole("dialog", { name: "Search pages" });
  const box = dialog.getByRole("combobox", { name: "Search pages" });
  await expect(box).toBeFocused();
  await expect(dialog).toContainText("Type to search");

  await box.fill("kyoto");
  const options = dialog.getByRole("option");
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText("Kyoto");
  await expect(options.nth(0)).toContainText("Home / Trips");
  await expect(options.nth(1)).toContainText("Plan the Kyoto trip");
  await expect(options.nth(2)).toContainText("Kyoto next year");
  await expect(options.nth(1).locator("mark")).toHaveText("Kyoto");
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");

  await box.press("ArrowDown");
  await box.press("ArrowDown");
  await expect(options.nth(2)).toHaveAttribute("aria-selected", "true");
  await box.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(app).toHaveURL(/#\/Trips\/Rome$/);
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Rome");
});

test("search narrows to pages with every word and says when none match", async ({
  openApp,
  sandbox,
}) => {
  await createNotes(sandbox, {
    "README.md": "# Home\n",
    "Kyoto/README.md": "# Kyoto\nTemples and a day trip to Nara\n",
    "Osaka/README.md": "# Osaka\nA trip for food\n",
  });
  const app = await openApp();
  await app.getByRole("button", { name: "Search" }).click();
  const dialog = app.getByRole("dialog", { name: "Search pages" });
  const box = dialog.getByRole("combobox", { name: "Search pages" });

  await box.fill("TRIP nara");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await expect(dialog.getByRole("option")).toContainText("Temples and a day trip to Nara");
  await expect(dialog.getByRole("option").locator("mark")).toHaveText(["trip", "Nara"]);

  await box.fill("paris");
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await expect(dialog).toContainText("No pages match.");

  await box.fill("osaka");
  await dialog.getByRole("option", { name: /Osaka/ }).click();
  await expect(app).toHaveURL(/#\/Osaka$/);

  await app.getByRole("button", { name: "Search" }).click();
  await app.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
