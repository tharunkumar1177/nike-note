/**
 * End-to-end tests for auto-sync against the real helper and a bare remote:
 * edits are committed and pushed on their own, changes pushed from another
 * clone come in, and a conflict pauses sync without losing local work.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Sandbox } from "./fixtures";
import { createNotes, git } from "./notes";

let notes = "";
let remote = "";

test.beforeEach(async ({ sandbox }) => {
  notes = await createNotes(sandbox, { "README.md": "# Plans\n\nFirst line\n" });
  remote = join(sandbox.dir, "remote.git");
});

/** Subject of the newest commit on the remote's main branch. */
function remoteSubject(sandbox: Sandbox): string {
  return git(sandbox, ["--git-dir", remote, "log", "-1", "--format=%s", "main"]).trim();
}

/** Clone the remote as another device would, commit `text` as README.md, and push. */
async function pushFromElsewhere(sandbox: Sandbox, text: string): Promise<void> {
  const other = join(sandbox.dir, "other");
  git(sandbox, ["clone", "--quiet", "--branch", "main", remote, other]);
  git(sandbox, ["config", "user.name", "Ben Editor"], other);
  git(sandbox, ["config", "user.email", "ben@example.com"], other);
  await writeFile(join(other, "README.md"), text);
  git(sandbox, ["commit", "--quiet", "--all", "-m", "Edit elsewhere"], other);
  git(sandbox, ["push", "--quiet"], other);
}

test("edits are committed and pushed on their own", async ({ openApp, sandbox }) => {
  const app = await openApp();
  const status = app.getByTestId("sync-status");
  await expect(status).toHaveText("Synced", { timeout: 20_000 });

  await app.getByText("First line", { exact: true }).click();
  await app.getByRole("textbox", { name: "Edit block" }).pressSequentially(", synced");
  await expect
    .poll(() => git(sandbox, ["--git-dir", remote, "show", "main:README.md"]), { timeout: 30_000 })
    .toBe("# Plans\n\nFirst line, synced\n");
  expect(remoteSubject(sandbox)).toBe("Quire: update 1 page");
  await expect(status).toHaveText("Synced");
});

test("changes pushed from elsewhere come in", async ({ openApp, sandbox }) => {
  const app = await openApp();
  await expect(app.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
  await pushFromElsewhere(sandbox, "# Plans\n\nFirst line\nAdded elsewhere\n");

  await app.getByRole("button", { name: "Sync now" }).click();
  await expect(app.getByText("Added elsewhere", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await readFile(join(notes, "README.md"), "utf8")).toBe(
    "# Plans\n\nFirst line\nAdded elsewhere\n",
  );
});

test("a conflict pauses sync and keeps local work", async ({ openApp, sandbox }) => {
  const app = await openApp();
  const status = app.getByTestId("sync-status");
  await expect(status).toHaveText("Synced", { timeout: 20_000 });
  await pushFromElsewhere(sandbox, "# Plans\n\nTheir line\n");

  await app.getByText("First line", { exact: true }).click();
  await app.getByRole("textbox", { name: "Edit block" }).pressSequentially(" mine");
  const notice = app.getByRole("alert").filter({ hasText: "Sync is paused" });
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice.getByRole("list", { name: "Changed on both sides" })).toHaveText("README.md");
  await expect(status).toHaveText("Sync paused");
  expect(await readFile(join(notes, "README.md"), "utf8")).toBe("# Plans\n\nFirst line mine\n");
  expect(remoteSubject(sandbox)).toBe("Edit elsewhere");

  git(sandbox, ["merge", "--quiet", "-X", "ours", "-m", "Keep mine", "origin/main"], notes);
  await notice.getByRole("button", { name: "Sync now" }).click();
  await expect(notice).toHaveCount(0, { timeout: 20_000 });
  await expect(status).toHaveText("Synced");
  expect(remoteSubject(sandbox)).toBe("Keep mine");
  const pushed = git(sandbox, ["--git-dir", remote, "show", "main:README.md"]);
  expect(pushed).toBe("# Plans\n\nFirst line mine\n");
});
