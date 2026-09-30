import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";

import { getHealthPort } from "../src/config.js";
import { createHealthServer } from "../src/health.js";

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Expected server to listen on a TCP port"));
        return;
      }

      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("createHealthServer", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createHealthServer();
    const port = await listen(server);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await close(server);
  });

  it("responds 200 with service status on GET /health", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "worker",
    });
  });

  it("responds 404 JSON for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/missing`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("responds 404 JSON for non-GET /health requests", async () => {
    const response = await fetch(`${baseUrl}/health`, { method: "POST" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });
});

describe("getHealthPort", () => {
  const originalHealthPort = process.env.HEALTH_PORT;

  afterEach(() => {
    if (originalHealthPort === undefined) {
      delete process.env.HEALTH_PORT;
    } else {
      process.env.HEALTH_PORT = originalHealthPort;
    }
  });

  it("defaults to 4002 when HEALTH_PORT is unset", () => {
    delete process.env.HEALTH_PORT;
    expect(getHealthPort()).toBe(4002);
  });

  it("defaults to 4002 when HEALTH_PORT is empty", () => {
    process.env.HEALTH_PORT = "   ";
    expect(getHealthPort()).toBe(4002);
  });

  it("accepts a valid port in range", () => {
    process.env.HEALTH_PORT = "8080";
    expect(getHealthPort()).toBe(8080);
  });

  it("throws when HEALTH_PORT is not an integer", () => {
    process.env.HEALTH_PORT = "abc";
    expect(() => getHealthPort()).toThrow(/HEALTH_PORT must be an integer/);
  });

  it("throws when HEALTH_PORT is below the valid range", () => {
    process.env.HEALTH_PORT = "0";
    expect(() => getHealthPort()).toThrow(/HEALTH_PORT must be an integer/);
  });

  it("throws when HEALTH_PORT is above the valid range", () => {
    process.env.HEALTH_PORT = "70000";
    expect(() => getHealthPort()).toThrow(/HEALTH_PORT must be an integer/);
  });
});
