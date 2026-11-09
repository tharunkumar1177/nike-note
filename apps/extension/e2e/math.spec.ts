/**
 * End-to-end tests for math like Notion's: block equations in `$$` lines and
 * math fences render with KaTeX, clicking one opens a TeX editor that
 * redraws it while typing, `/equation` and typed `$$…$$` add one, the
 * keyboard moves past and deletes a selected equation, and inline `$…$`
 * math renders in text and is added with Ctrl+Shift+E. The rest of the page
 * keeps its bytes and line endings.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createNotes } from "./notes";

test("clicking an equation edits its TeX and redraws it", async ({ openApp, sandbox }) => {
  const notes = await createNotes(sandbox, {
    "README.md": "# Proof\n\nBefore\n$$\n\\sqrt{x}\n$$\nInline $a^2+b^2$ here.\n```math\nx\n```\nAfter\n",
  });
  const readme = () => readFile(join(notes, "README.md"), "utf8");
  const app = await openApp();
  const equations = app.getByRole("figure", { name: "Equation", exact: true });
  await expect(equations).toHaveCount(2);
  await expect(equations.first().locator(".katex-display")).toBeVisible();
  await expect(app.locator(".block--text .math--inline .katex")).toBeVisible();
  await expect(app.getByRole("textbox", { name: "Edit block" })).toHaveCount(0);

  await equations.first().click();
  const tex = app.getByRole("textbox", { name: "TeX" });
  await expect(tex).toBeFocused();
  await expect(tex).toHaveValue("\\sqrt{x}");

  await tex.fill("\\frac{1}{2");
  await expect(app.locator(".math-editor__message--error")).toContainText("expected '}'");
  await expect(equations.first().locator(".math--error")).toHaveText("\\frac{1}{2");
  await expect(tex).toHaveAttribute("aria-invalid", "true");
  await tex.fill("\\frac{1}{2}");
  await expect(equations.first().locator(".mfrac")).toBeVisible();
  await expect(tex).toHaveAttribute("aria-invalid", "false");
  await app.keyboard.press("Shift+Enter");
  await app.keyboard.type("= y");
  await expect
    .poll(readme)
    .toBe("# Proof\n\nBefore\n$$\n\\frac{1}{2}\n= y\n$$\nInline $a^2+b^2$ here.\n```math\nx\n```\nAfter\n");

  await app.keyboard.press("Enter");
  await expect(tex).toHaveCount(0);
  await expect(equations.first()).toBeFocused();

  await equations.nth(1).click();
  await expect(tex).toHaveValue("x");
  await tex.fill("\n\ny");
  await app.keyboard.press("Escape");
  await expect(tex).toHaveCount(0);
  await expect.poll(readme).toContain("Inline $a^2+b^2$ here.\n```math\n\n\ny\n```\nAfter\n");
});

test("/equation adds an equation that the keyboard moves past and deletes", async ({
  openApp,
  sandbox,
}) => {
  const notes = await createNotes(sandbox, { "README.md": "\uFEFF# Physics\r\n\r\nIntro\r\n" });
  const readme = () => readFile(join(notes, "README.md"), "utf8");
  const app = await openApp();
  await app.getByText("Intro", { exact: true }).click();
  const line = app.getByRole("textbox", { name: "Edit block" });
  await app.keyboard.press("End");
  await app.keyboard.press("Enter");
  await app.keyboard.type("/equation");
  await app.keyboard.press("Enter");

  const tex = app.getByRole("textbox", { name: "TeX" });
  await expect(tex).toBeFocused();
  await expect.poll(readme).toBe("\uFEFF# Physics\r\n\r\nIntro\r\n$$\r\n$$\r\n");
  await app.keyboard.type("E = mc^2");
  await expect.poll(readme).toBe("\uFEFF# Physics\r\n\r\nIntro\r\n$$\r\nE = mc^2\r\n$$\r\n");
  await app.keyboard.press("Enter");
  const equation = app.getByRole("figure", { name: "Equation", exact: true });
  await expect(equation).toBeFocused();
  await expect(equation.locator(".katex-display")).toBeVisible();

  await app.keyboard.press("ArrowUp");
  await expect(line).toBeFocused();
  await expect(line).toHaveValue("Intro");
  await app.keyboard.press("ArrowDown");
  await expect(equation).toBeFocused();
  await app.keyboard.press("ArrowDown");
  await expect(line).toBeFocused();
  await app.keyboard.type("End");
  await expect
    .poll(readme)
    .toBe("\uFEFF# Physics\r\n\r\nIntro\r\n$$\r\nE = mc^2\r\n$$\r\nEnd\r\n");

  await app.keyboard.press("Home");
  await app.keyboard.press("ArrowUp");
  await expect(equation).toBeFocused();
  await app.keyboard.press("Enter");
  await expect(tex).toBeFocused();
  await app.keyboard.press("Escape");
  await expect(equation).toBeFocused();
  await app.keyboard.press("Backspace");
  await expect.poll(readme).toBe("\uFEFF# Physics\r\n\r\nIntro\r\nEnd\r\n");
  await expect(equation).toHaveCount(0);
  await expect(line).toBeFocused();
});

test("inline equations render and Ctrl+Shift+E or $$…$$ adds math", async ({
  openApp,
  sandbox,
}) => {
  const notes = await createNotes(sandbox, {
    "README.md": "# Circles\n\nArea is \\pi r^2 for $5 and $10.\n",
  });
  const readme = () => readFile(join(notes, "README.md"), "utf8");
  const app = await openApp();
  await app.getByText("Area is", { exact: false }).click();
  const line = app.getByRole("textbox", { name: "Edit block" });
  await expect(line).toBeFocused();
  await line.evaluate((box: HTMLTextAreaElement) => box.setSelectionRange(8, 15));
  await app.keyboard.press("Control+Shift+E");
  await expect.poll(readme).toBe("# Circles\n\nArea is $\\pi r^2$ for $5 and $10.\n");

  await app.keyboard.press("Escape");
  const paragraph = app.locator(".block--text", { hasText: "Area is" });
  await expect(paragraph.locator(".math--inline .katex")).toHaveCount(1);
  await expect(paragraph).toContainText("for $5 and $10.");

  await app.locator(".page__tail").click();
  await app.keyboard.type("$$x^3$$");
  const tex = app.getByRole("textbox", { name: "TeX" });
  await expect(tex).toBeFocused();
  await expect(tex).toHaveValue("x^3");
  await app.keyboard.type("+1");
  await expect.poll(readme).toBe("# Circles\n\nArea is $\\pi r^2$ for $5 and $10.\n$$x^3+1$$\n");
});
