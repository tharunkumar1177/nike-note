import { expect, test } from "@playwright/test";

test.describe("Quire landing page", () => {
  test("home page shows the Quire heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Quire");
  });

  test("document title is Quire", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Quire");
  });

  test("health endpoint returns ok status", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "web",
    });
  });
});
