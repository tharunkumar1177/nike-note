/**
 * Unit tests for helper message validation and disconnect classification.
 */
import { describe, expect, it } from "vitest";

import {
  classifyDisconnect,
  parseHelloResult,
  parseInbound,
} from "../src/shared/protocol";

describe("parseInbound", () => {
  it("accepts a success response", () => {
    expect(parseInbound({ id: 3, result: { ok: true } })).toEqual({
      kind: "response",
      id: 3,
      result: { ok: true },
    });
  });

  it("accepts an error with a null id", () => {
    expect(
      parseInbound({ id: null, error: { code: "BAD_REQUEST", message: "bad" } }),
    ).toEqual({ kind: "error", id: null, code: "BAD_REQUEST", message: "bad" });
  });

  it("accepts an event", () => {
    expect(parseInbound({ event: "filesChanged", data: ["a"] })).toEqual({
      kind: "event",
      event: "filesChanged",
      data: ["a"],
    });
  });

  it.each([
    null,
    "text",
    [1],
    { id: 0, result: 1 },
    { id: "1", result: 1 },
    { id: 1 },
    { id: 1, error: "bad" },
    { id: 1, error: { code: 5, message: "x" } },
    { id: -1, error: { code: "IO", message: "x" } },
  ])("rejects malformed message %j", (value) => {
    expect(parseInbound(value)).toBeNull();
  });
});

describe("parseHelloResult", () => {
  it("returns a typed hello result", () => {
    expect(
      parseHelloResult({ helperVersion: "0.1.0", protocol: 1, os: "linux", arch: "x86_64" }),
    ).toEqual({ helperVersion: "0.1.0", protocol: 1, os: "linux", arch: "x86_64" });
  });

  it("throws on a missing field", () => {
    expect(() => parseHelloResult({ helperVersion: "0.1.0", protocol: 1 })).toThrow(
      TypeError,
    );
  });
});

describe("classifyDisconnect", () => {
  it("maps Chrome's messages to connection screens", () => {
    expect(classifyDisconnect("Specified native messaging host not found.")).toBe(
      "missing",
    );
    expect(
      classifyDisconnect("Access to the specified native messaging host is forbidden."),
    ).toBe("forbidden");
    expect(classifyDisconnect("Native host has exited.")).toBe("stopped");
    expect(classifyDisconnect(undefined)).toBe("stopped");
  });
});
