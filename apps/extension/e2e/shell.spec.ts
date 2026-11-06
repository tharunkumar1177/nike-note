/**
 * End-to-end tests for the popup, the app page, and the helper handshake.
 */
import { expect, test } from "./fixtures";

test.describe("with the helper registered", () => {
  test("Open Quire opens the app once and then focuses it", async ({
    context,
    extensionUrl,
  }) => {
    const appPages = () => context.pages().filter((page) => page.url().endsWith("/app.html"));

    const popup = await context.newPage();
    await popup.goto(extensionUrl("popup.html"));
    const opened = context.waitForEvent("page");
    await popup.getByRole("button", { name: "Open Quire" }).click();
    const app = await opened;
    await app.waitForURL(/\/app\.html$/);
    expect(appPages()).toHaveLength(1);

    const secondPopup = await context.newPage();
    await secondPopup.goto(extensionUrl("popup.html"));
    await secondPopup.getByRole("button", { name: "Open Quire" }).click();
    await expect.poll(() => appPages().length).toBe(1);
  });

  test("the app page completes the hello handshake", async ({ openApp }) => {
    const app = await openApp();
    await expect(app).toHaveTitle("Quire");
    await expect(
      app.getByRole("heading", { name: "Quire Helper is connected" }),
    ).toBeVisible();
    await expect(app.getByRole("contentinfo", { name: "Status" })).toContainText(
      /Helper \d+\.\d+\.\d+/,
    );
    await expect(app.getByText(/running on Linux \(x86_64\)/)).toBeVisible();
  });
});

test.describe("without the helper registered", () => {
  test.use({ helperInstalled: false });

  test("the app page shows the install screen", async ({ openApp }) => {
    const app = await openApp();
    await expect(app.getByRole("heading", { name: "Install Quire Helper" })).toBeVisible();
    await expect(app.getByText("quire-helper-linux")).toBeVisible();
    await expect(app.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});
