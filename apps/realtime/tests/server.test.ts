import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parsePort } from "../src/config.js";
import { createServer } from "../src/server.js";

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
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

describe("createServer", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer();
    const port = await listen(server);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await close(server);
  });

  it("responds to GET /health with service status", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "realtime",
    });
  });

  it("responds with 404 JSON for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/missing`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("responds with 404 JSON for non-GET /health requests", async () => {
    const response = await fetch(`${baseUrl}/health`, { method: "POST" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });
});

describe("parsePort", () => {
  it("defaults to 4001 when unset", () => {
    expect(parsePort(undefined)).toBe(4001);
  });

  it("accepts a valid port in range", () => {
    expect(parsePort("8080")).toBe(8080);
    expect(parsePort("1")).toBe(1);
    expect(parsePort("65535")).toBe(65535);
  });

  it("throws for invalid ports", () => {
    expect(() => parsePort("")).toThrow(/Invalid PORT/);
    expect(() => parsePort("abc")).toThrow(/Invalid PORT/);
    expect(() => parsePort("4001.5")).toThrow(/Invalid PORT/);
    expect(() => parsePort("0")).toThrow(/Invalid PORT/);
    expect(() => parsePort("65536")).toThrow(/Invalid PORT/);
    expect(() => parsePort("-1")).toThrow(/Invalid PORT/);
  });
});
