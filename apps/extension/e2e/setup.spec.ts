/**
 * End-to-end test for choosing a notes folder and setting up Git sync against
 * a local bare repository.
 */
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { git } from "./notes";

test("a new folder is set up, pushed, and remembered", async ({ sandbox, openApp }) => {
  const remote = join(sandbox.dir, "remote.git");
  git(sandbox, ["init", "--bare", "--quiet", remote]);

  const app = await openApp();
  await expect(app.getByRole("heading", { name: "Choose a notes folder" })).toBeVisible();
  await expect(app.getByText(sandbox.home, { exact: true })).toBeVisible();
  await expect(app.getByText("No folders here")).toBeVisible();

  await app.getByRole("button", { name: "New folder" }).click();
  await app.getByRole("textbox", { name: "New folder name" }).fill("notes");
  await app.getByRole("button", { name: "Create" }).click();
  await expect(app.getByText(join(sandbox.home, "notes"), { exact: true })).toBeVisible();
  await app.getByRole("button", { name: "Use this folder" }).click();

  await expect(app.getByRole("heading", { name: "Set up sync" })).toBeVisible();
  await app.getByRole("button", { name: "Turn on Git" }).click();

  await app.getByRole("textbox", { name: "Name" }).fill("Ana Writer");
  await app.getByRole("textbox", { name: "Email" }).fill("ana@example.com");
  await app.getByRole("button", { name: "Save" }).click();

  await app.getByRole("textbox", { name: "Repository URL" }).fill(remote);
  await app.getByRole("button", { name: "Connect" }).click();

  await app.getByRole("button", { name: "Sync now" }).click();
  await expect(app.getByRole("heading", { level: 1, name: "notes" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(app.getByTestId("status-branch")).toHaveText("main");

  const log = git(sandbox, ["--git-dir", remote, "log", "--format=%an <%ae> %s", "main"]);
  expect(log.trim()).toBe("Ana Writer <ana@example.com> Quire: initial commit");
  const files = git(sandbox, ["--git-dir", remote, "ls-tree", "--name-only", "main"]);
  expect(files.trim()).toBe("README.md");

  await app.reload();
  await expect(app.getByRole("heading", { level: 1, name: "notes" })).toBeVisible();
});

test("setup errors are shown and the step can be retried", async ({ openApp }) => {
  const app = await openApp();
  await app.getByRole("button", { name: "New folder" }).click();
  await app.getByRole("textbox", { name: "New folder name" }).fill("bad/name");
  await app.getByRole("button", { name: "Create" }).click();
  await expect(app.getByRole("alert")).toBeVisible();

  await app.getByRole("textbox", { name: "New folder name" }).fill("notes");
  await app.getByRole("button", { name: "Create" }).click();
  await app.getByRole("button", { name: "Use this folder" }).click();
  await app.getByRole("button", { name: "Turn on Git" }).click();
  const name = app.getByRole("textbox", { name: "Name" });
  const email = app.getByRole("textbox", { name: "Email" });
  await name.fill("Ana Writer");
  await email.fill("not-an-email");
  await app.getByRole("button", { name: "Save" }).click();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);

  await name.fill("-Ana");
  await email.fill("ana@example.com");
  await app.getByRole("button", { name: "Save" }).click();
  await expect(app.getByRole("alert")).toBeVisible();

  await name.fill("Ana Writer");
  await app.getByRole("button", { name: "Save" }).click();
  await expect(app.getByRole("textbox", { name: "Repository URL" })).toBeVisible();
  await expect(app.getByRole("alert")).toHaveCount(0);
});
