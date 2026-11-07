/**
 * End-to-end tests for read-only page rendering: README.md bodies read by the
 * helper are shown as blocks with inline formatting and safe links.
 */
import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

/** A home page that uses every block type, plus a linked and an unlinked sub-page. */
const HOME = [
  "---",
  "tags: travel",
  "---",
  "# Field notes",
  "",
  "Plans with **bold**, *soft*, `code`, a [site](https://example.com),",
  "a [trip link](Trip/README.md) and an [old file](ftp://example.com/x).",
  "",
  "## Plan",
  "> Bring a jacket",
  "- Pack",
  "  - Socks",
  "- [x] Book flights",
  "- [ ] Book hotel",
  "3. Third",
  "4. Fourth",
  "---",
  "```js",
  "const days = 5;",
  "```",
  "| Day | City |",
  "| --- | ---- |",
  "| 1   | Lisbon |",
  "",
  "[Trip](Trip/README.md)",
  "",
].join("\n");

test.beforeEach(async ({ sandbox }) => {
  await createNotes(sandbox, {
    "README.md": HOME,
    "Trip/README.md": "# Trip to Lisbon\n\nTram 28.\n",
    "Other/README.md": "# Other ideas\n",
    "Big/README.md": `# Big\n\n${"A long line of notes.\n".repeat(30_000)}`,
  });
});

test("a page body renders as blocks with its heading as the title", async ({ openApp }) => {
  const app = await openApp();
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Field notes");
  const blocks = app.locator(".blocks");
  await expect(blocks.getByText("Field notes")).toHaveCount(0);
  await expect(blocks.getByRole("heading", { level: 2 })).toHaveText("Plan");
  await expect(blocks.locator("strong")).toHaveText("bold");
  await expect(blocks.locator("em")).toHaveText("soft");
  await expect(blocks.locator(".inline-code")).toHaveText("code");
  await expect(blocks.locator("blockquote")).toHaveText("Bring a jacket");
  await expect(blocks.locator(".block--bullet")).toHaveText(["•Pack", "◦Socks"]);
  await expect(blocks.getByRole("checkbox", { name: "Done" })).toBeChecked();
  await expect(blocks.getByRole("checkbox", { name: "Not done" })).not.toBeChecked();
  await expect(blocks.locator(".block--numbered .block__marker")).toHaveText(["3.", "4."]);
  await expect(blocks.locator("hr")).toHaveCount(1);
  await expect(blocks.locator(".block--code figcaption")).toHaveText("js");
  await expect(blocks.locator(".block--code code")).toHaveText("const days = 5;");
  await expect(blocks.getByLabel("Table source")).toContainText("| 1   | Lisbon |");
  await expect(blocks.getByText("Properties")).toBeVisible();
});

test("links are safe and page links open in Quire", async ({ openApp }) => {
  const app = await openApp();
  const blocks = app.locator(".blocks");
  const site = blocks.getByRole("link", { name: "site", exact: true });
  await expect(site).toHaveAttribute("href", "https://example.com");
  await expect(site).toHaveAttribute("target", "_blank");
  await expect(site).toHaveAttribute("rel", /noreferrer/);
  await expect(blocks.getByRole("link", { name: "old file" })).toHaveCount(0);
  await expect(blocks.locator(".inline-link--inert")).toHaveAttribute(
    "title",
    "ftp://example.com/x",
  );
  await expect(blocks.getByRole("link", { name: "trip link" })).toHaveAttribute("href", "#/Trip");

  const unlinked = app.locator(".subpages");
  await expect(unlinked.getByRole("heading")).toHaveText("Other sub-pages");
  await expect(unlinked.getByRole("link")).toHaveText(["Big", "Other ideas"]);

  await blocks.getByRole("link", { name: "Trip to Lisbon", exact: true }).click();
  await expect(app).toHaveURL(/#\/Trip$/);
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Trip to Lisbon");
  await expect(app.locator(".blocks")).toHaveText("Tram 28.");
});

test("pages over the size limit explain why they cannot open", async ({ openApp }) => {
  const app = await openApp();
  await app.evaluate(() => {
    window.location.hash = "#/Big";
  });
  await expect(app.getByRole("alert")).toContainText("too large for Quire to open yet");
  await expect(app.getByRole("heading", { level: 1 })).toHaveText("Big");
});
