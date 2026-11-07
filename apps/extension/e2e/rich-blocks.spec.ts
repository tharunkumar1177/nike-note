/**
 * End-to-end tests for rich blocks: images loaded from the notes folder,
 * callouts, toggles, and tables render formatted; `/table` adds a table; and
 * an image dropped on the page is saved into the page's assets folder.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

/** A 1×1 PNG. */
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let notes = "";

/** The notes folder's home README.md. */
function readme(): Promise<string> {
  return readFile(join(notes, "README.md"), "utf8");
}

test("images, callouts, toggles, and tables render formatted", async ({ openApp, sandbox }) => {
  notes = await createNotes(sandbox, {
    "README.md": [
      "# Trip",
      "",
      "![Kyoto map](assets/kyoto%20map.png)",
      "> [!WARNING]",
      "> Pack **light**",
      "<details>",
      "<summary>Packing list</summary>",
      "",
      "- [x] Passport",
      "</details>",
      "| City | Nights |",
      "| --- | ---: |",
      "| Kyoto | 3 |",
      "",
    ].join("\n"),
  });
  await mkdir(join(notes, "assets"), { recursive: true });
  await writeFile(join(notes, "assets", "kyoto map.png"), Buffer.from(PNG, "base64"));
  const app = await openApp();

  const image = app.getByRole("img", { name: "Kyoto map" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);

  const callout = app.getByRole("complementary", { name: "Warning" });
  await expect(callout).toContainText("Pack light");
  await expect(callout.locator("strong")).toHaveText("light");

  const passport = app.getByRole("checkbox", { name: "Done" });
  await expect(passport).toBeHidden();
  await app.getByText("Packing list").click();
  await expect(passport).toBeVisible();
  await expect(passport).toBeDisabled();

  const table = app.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["City", "Nights"]);
  await expect(table.getByRole("cell")).toHaveText(["Kyoto", "3"]);
  await expect(table.getByRole("cell", { name: "3" })).toHaveCSS("text-align", "right");
});

test("/table adds a table whose first cell takes the typing", async ({ openApp, sandbox }) => {
  notes = await createNotes(sandbox, { "README.md": "# T\n\nIntro\n" });
  const app = await openApp();
  await app.getByText("Intro", { exact: true }).click();
  await app.keyboard.press("End");
  await app.keyboard.press("Enter");
  await app.keyboard.type("/table");
  await app.keyboard.press("Enter");
  await app.keyboard.type("Kyoto");
  await expect
    .poll(readme)
    .toBe("# T\n\nIntro\n| Column 1 | Column 2 |\n| --- | --- |\n| Kyoto |  |\n");
  await app.keyboard.press("Escape");
  await expect(app.getByRole("table").getByRole("cell").first()).toHaveText("Kyoto");
});

test("an image dropped on the page is saved into assets and shown", async ({
  openApp,
  sandbox,
}) => {
  notes = await createNotes(sandbox, { "README.md": "# Home\n\nfirst\nsecond\n" });
  const app = await openApp();
  const slot = app.locator(".block-slot", { hasText: "second" });
  await expect(slot).toBeVisible();
  const box = await slot.boundingBox();
  if (!box) throw new Error("The block has no box.");
  const transfer = await app.evaluateHandle((data) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const files = new DataTransfer();
    files.items.add(new File([bytes], "dot.png", { type: "image/png" }));
    return files;
  }, PNG);
  const point = { clientX: box.x + 40, clientY: box.y + 2 };
  await slot.dispatchEvent("dragover", { dataTransfer: transfer, ...point });
  await slot.dispatchEvent("drop", { dataTransfer: transfer, ...point });

  await expect.poll(readme).toBe("# Home\n\nfirst\n![dot](assets/dot.png)\nsecond\n");
  expect(await readFile(join(notes, "assets", "dot.png"))).toEqual(Buffer.from(PNG, "base64"));
  const image = app.getByRole("img", { name: "dot" });
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
});
