/**
 * End-to-end tests for editing images like Notion: clicking selects an
 * image, the toolbar aligns it and adds a caption, the side handles resize
 * it with the mouse or the keyboard, the menu edits alt text, replaces the
 * file, and goes back to the original size, and the keyboard adds a line
 * below or deletes the image. Sized and aligned images are written as the
 * HTML GitHub honors; the rest of the page keeps its bytes.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { encodePng } from "../src/build/png";
import { expect, test, type Sandbox } from "./fixtures";
import { createNotes } from "./notes";

/** A solid 400×200 PNG, wide enough to resize. */
function picture(): Buffer {
  const width = 400;
  const height = 200;
  const rgba = new Uint8Array(width * height * 4);
  for (let at = 0; at < rgba.length; at += 4) rgba.set([35, 131, 226, 255], at);
  return encodePng(width, height, rgba);
}

/** Make a notes folder whose home page is `page` and whose assets hold `map.png`. */
async function notesWithMap(sandbox: Sandbox, page: string): Promise<string> {
  const notes = await createNotes(sandbox, { "README.md": page });
  await mkdir(join(notes, "assets"), { recursive: true });
  await writeFile(join(notes, "assets", "map.png"), picture());
  return notes;
}

test("the toolbar and handles align, resize, and caption an image", async ({
  openApp,
  sandbox,
}) => {
  const notes = await notesWithMap(sandbox, "# Trip\n\nBefore\n![Map](assets/map.png)\nAfter\n");
  const readme = () => readFile(join(notes, "README.md"), "utf8");
  const app = await openApp();
  const image = app.getByRole("img", { name: "Map" });
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(400);

  await image.click();
  const figure = app.getByRole("figure", { name: "Image: Map" });
  await expect(figure).toBeFocused();
  await expect(app.getByRole("textbox", { name: "Edit block" })).toHaveCount(0);

  await figure.getByRole("button", { name: "Align center" }).click();
  await expect
    .poll(readme)
    .toBe('# Trip\n\nBefore\n<p align="center"><img src="assets/map.png" alt="Map"></p>\n\nAfter\n');
  await expect(figure.getByRole("button", { name: "Align center" })).toHaveAttribute("aria-pressed", "true");
  await expect(figure).toBeFocused();

  const right = figure.getByRole("separator", { name: "Resize image from the right edge" });
  const box = await right.boundingBox();
  if (!box) throw new Error("The resize handle has no box.");
  await app.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await app.mouse.down();
  await app.mouse.move(box.x + box.width / 2 - 25, box.y + box.height / 2, { steps: 4 });
  await app.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2, { steps: 4 });
  await app.mouse.up();
  await expect
    .poll(readme)
    .toBe(
      '# Trip\n\nBefore\n<p align="center"><img src="assets/map.png" alt="Map" width="300"></p>\n\nAfter\n',
    );
  await expect(image).toHaveCSS("width", "300px");

  await right.focus();
  await app.keyboard.press("ArrowRight");
  await expect.poll(readme).toContain('width="316"');

  await figure.getByRole("button", { name: "Caption" }).click();
  const caption = figure.getByRole("textbox", { name: "Caption" });
  await expect(caption).toBeFocused();
  await app.keyboard.type("Day 1");
  await app.keyboard.press("Enter");
  await expect(caption).toHaveCount(0);
  await expect(figure.locator("figcaption")).toHaveText("Day 1");
  await expect.poll(readme).toContain('alt="Map" title="Day 1" width="316"></p>');

  await figure.getByRole("button", { name: "Image actions" }).click();
  await app.getByRole("menuitem", { name: "Original size" }).click();
  await expect.poll(readme).toContain('alt="Map" title="Day 1"></p>');

  await figure.getByRole("button", { name: "Align left" }).click();
  await expect.poll(readme).toBe('# Trip\n\nBefore\n![Map](assets/map.png "Day 1")\n\nAfter\n');
});

test("Enter adds a line below a selected image and Backspace deletes it", async ({
  openApp,
  sandbox,
}) => {
  const notes = await notesWithMap(sandbox, "# Trip\r\n\r\n![Map](assets/map.png)\r\nAfter\r\n");
  const readme = () => readFile(join(notes, "README.md"), "utf8");
  const app = await openApp();
  const figure = app.getByRole("figure", { name: "Image: Map" });
  await app.getByRole("img", { name: "Map" }).click();
  await expect(figure).toBeFocused();

  await app.keyboard.press("Enter");
  const line = app.getByRole("textbox", { name: "Edit block" });
  await expect(line).toBeFocused();
  await app.keyboard.type("Notes");
  await expect.poll(readme).toBe("# Trip\r\n\r\n![Map](assets/map.png)\r\nNotes\r\nAfter\r\n");

  await app.keyboard.press("Home");
  await app.keyboard.press("ArrowUp");
  await expect(figure).toBeFocused();
  await app.keyboard.press("ArrowDown");
  await expect(line).toBeFocused();
  await app.keyboard.press("ArrowUp");
  await expect(figure).toBeFocused();

  await app.keyboard.press("Backspace");
  await expect.poll(readme).toBe("# Trip\r\n\r\nNotes\r\nAfter\r\n");
  await expect(figure).toHaveCount(0);
  await expect(line).toBeFocused();
});

test("the image menu edits alt text and replaces the file", async ({ openApp, sandbox }) => {
  const notes = await notesWithMap(
    sandbox,
    '# Trip\n\n<p align="right"><img src="assets/map.png" alt="Map" width="120"></p>\n',
  );
  const readme = () => readFile(join(notes, "README.md"), "utf8");
  const app = await openApp();
  const image = app.getByRole("img", { name: "Map" });
  await expect(image).toHaveCSS("width", "120px");
  const figure = app.getByRole("figure", { name: "Image: Map" });
  const frame = figure.locator(".image-editor__frame");
  const column = await figure.boundingBox();
  const shown = await frame.boundingBox();
  if (!column || !shown) throw new Error("The image has no box.");
  expect(Math.round(shown.x + shown.width)).toBe(Math.round(column.x + column.width));
  expect(Math.round(shown.width)).toBe(120);

  await figure.getByRole("button", { name: "Image actions" }).click();
  await app.getByRole("menuitem", { name: "Alt text…" }).click();
  const alt = app.getByRole("textbox", { name: "Alt text" });
  await expect(alt).toBeFocused();
  await alt.fill("Kyoto & Nara");
  await app.keyboard.press("Enter");
  await expect
    .poll(readme)
    .toBe('# Trip\n\n<p align="right"><img src="assets/map.png" alt="Kyoto &amp; Nara" width="120"></p>\n');
  const renamed = app.getByRole("figure", { name: "Image: Kyoto & Nara" });
  await expect(renamed).toBeFocused();

  const chooser = app.waitForEvent("filechooser");
  await renamed.getByRole("button", { name: "Image actions" }).click();
  await app.getByRole("menuitem", { name: "Replace image…" }).click();
  await (await chooser).setFiles({ name: "pin.png", mimeType: "image/png", buffer: picture() });
  await expect
    .poll(readme)
    .toBe('# Trip\n\n<p align="right"><img src="assets/pin.png" alt="pin" width="120"></p>\n');
  expect(await readFile(join(notes, "assets", "pin.png"))).toEqual(picture());
  expect(await readFile(join(notes, "assets", "map.png"))).toEqual(picture());
  await expect(app.getByRole("img", { name: "pin" })).toHaveCSS("width", "120px");
});
