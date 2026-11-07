/**
 * End-to-end tests for the sidebar page tree and page navigation against a
 * real notes folder read by the helper.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

/** A small notes folder covering link order, fallbacks, and excluded folders. */
const FILES = {
  "README.md": "# Home\n\n[Trips](Trips/README.md)\n[Recipes](Recipes/README.md)\n",
  "Trips/README.md": "# My trips\n\n[Japan](Japan%202027/README.md)\n",
  "Trips/Japan 2027/README.md": "# Japan 2027\n\nTokyo, then Kyoto.\n",
  "Trips/Berlin/README.md": "Notes without a heading.\n",
  "Recipes/README.md": "# Recipes\n",
  "Books/README.md": "```\n# not a title\n```\n# Books I liked\n",
  "assets/.keep": "",
};

test.beforeEach(async ({ sandbox }) => {
  await createNotes(sandbox, FILES, ["Archive"]);
});

test("the sidebar lists pages in link order, then by name", async ({ openApp }) => {
  const app = await openApp();
  const tree = app.getByRole("tree", { name: "Pages" });
  await expect(tree.getByRole("treeitem")).toHaveText([
    "Home",
    "My trips",
    "Recipes",
    "Archive",
    "Books I liked",
  ]);
  await expect(tree.getByRole("treeitem", { name: "Home" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Home");
  await expect(app).toHaveTitle("Home – Quire");
});

test("pages open from the tree and survive a reload", async ({ openApp }) => {
  const app = await openApp();
  const tree = app.getByRole("tree", { name: "Pages" });
  const trips = tree.getByRole("treeitem", { name: "My trips" });
  await expect(trips).toHaveAttribute("aria-expanded", "false");
  await trips.locator(".tree__toggle").click();
  await expect(trips).toHaveAttribute("aria-expanded", "true");
  await tree.getByRole("treeitem", { name: "Japan 2027" }).click();

  await expect(app).toHaveURL(/#\/Trips\/Japan%202027$/);
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Japan 2027");
  const breadcrumb = app.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.getByRole("listitem")).toHaveText(["Home", "My trips", "Japan 2027"]);

  await app.reload();
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Japan 2027");
  await expect(
    app.getByRole("treeitem", { name: "Japan 2027" }),
  ).toHaveAttribute("aria-selected", "true");

  await breadcrumb.getByRole("link", { name: "My trips" }).click();
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("My trips");
  await expect(app.getByRole("link", { name: "Japan 2027" })).toBeVisible();
  await expect(app.getByRole("link", { name: "Berlin" })).toBeVisible();
  await app.goBack();
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Japan 2027");
});

test("the tree works from the keyboard", async ({ openApp }) => {
  const app = await openApp();
  const home = app.getByRole("treeitem", { name: "Home" });
  await home.focus();
  await app.keyboard.press("ArrowDown");
  await expect(app.getByRole("treeitem", { name: "My trips" })).toBeFocused();
  await app.keyboard.press("ArrowRight");
  await expect(app.getByRole("treeitem", { name: "My trips" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await app.keyboard.press("ArrowRight");
  await expect(app.getByRole("treeitem", { name: "Japan 2027" })).toBeFocused();
  await app.keyboard.press("Enter");
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Japan 2027");
  await app.keyboard.press("ArrowLeft");
  await expect(app.getByRole("treeitem", { name: "My trips" })).toBeFocused();
});

test("folders without a README and unknown pages are explained", async ({ openApp }) => {
  const app = await openApp();
  await app.getByRole("treeitem", { name: "Archive" }).click();
  await expect(app.getByText("This page has no README.md yet.", { exact: false })).toBeVisible();

  await app.evaluate(() => {
    window.location.hash = "#/Nowhere";
  });
  await expect(app.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await app.getByRole("link", { name: "Go to Home" }).click();
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Home");
});

test("pages added outside Quire appear when the tab is shown again", async ({
  openApp,
  sandbox,
}) => {
  const app = await openApp();
  await expect(app.getByRole("treeitem")).toHaveCount(5);
  const notes = join(sandbox.home, "notes");
  await mkdir(join(notes, "Zoo"));
  await writeFile(join(notes, "Zoo", "README.md"), "# Zoo visit\n");
  await app.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(app.getByRole("treeitem", { name: "Zoo visit" })).toBeVisible();
});
