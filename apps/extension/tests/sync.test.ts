/**
 * Unit tests for the sync result validator.
 */
import { describe, expect, it } from "vitest";

import { parseSyncResult } from "../src/shared/sync";

const synced = {
  state: "synced",
  ahead: 0,
  behind: 0,
  committed: 2,
  pulled: true,
  files: [],
  message: null,
};

describe("parseSyncResult", () => {
  it("accepts each state", () => {
    expect(parseSyncResult(synced)).toEqual(synced);
    expect(
      parseSyncResult({ ...synced, state: "offline", ahead: 1, message: "Could not resolve host" })
        .message,
    ).toBe("Could not resolve host");
    expect(
      parseSyncResult({ ...synced, state: "conflict", files: ["README.md", 4, "Trips/README.md"] })
        .files,
    ).toEqual(["README.md", "Trips/README.md"]);
  });

  it("rejects malformed results", () => {
    expect(() => parseSyncResult({ ...synced, state: "done" })).toThrow(TypeError);
    expect(() => parseSyncResult({ ...synced, ahead: -1 })).toThrow(TypeError);
    expect(() => parseSyncResult({ ...synced, behind: 1.5 })).toThrow(TypeError);
    expect(() => parseSyncResult({ ...synced, files: null })).toThrow(TypeError);
    expect(() => parseSyncResult({ ...synced, message: 3 })).toThrow(TypeError);
    expect(() => parseSyncResult(null)).toThrow(TypeError);
  });
});
