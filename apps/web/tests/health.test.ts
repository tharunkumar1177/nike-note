import { describe, expect, it } from "vitest";

import { GET } from "../app/api/health/route.js";

describe("GET /api/health", () => {
  it("returns ok status for the web service", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "web",
    });
  });
});
