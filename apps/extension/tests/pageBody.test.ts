/**
 * Unit tests for the page body, save result, and file change validators.
 */
import { describe, expect, it } from "vitest";

import { parseFilesChanged, parsePageBody, parseSavedPage } from "../src/shared/pageBody";

describe("parsePageBody", () => {
  it("accepts a page with or without a README.md", () => {
    expect(parsePageBody({ path: "a", exists: true, content: "# A\n", hash: "ab" })).toEqual({
      path: "a",
      exists: true,
      content: "# A\n",
      hash: "ab",
    });
    expect(parsePageBody({ path: "", exists: false, content: "", hash: null }).hash).toBeNull();
  });

  it("rejects malformed results", () => {
    expect(() => parsePageBody({ path: "a", exists: true, content: "x" })).toThrow(TypeError);
    expect(() => parsePageBody({ path: "a", exists: "yes", content: "", hash: null })).toThrow(
      TypeError,
    );
  });
});

describe("parseSavedPage", () => {
  it("needs the new hash", () => {
    expect(parseSavedPage({ path: "a", hash: "cd" })).toEqual({ path: "a", hash: "cd" });
    expect(() => parseSavedPage({ path: "a", hash: null })).toThrow(TypeError);
  });
});

describe("parseFilesChanged", () => {
  it("lists changed pages, or asks for a full refresh", () => {
    expect(parseFilesChanged({ pages: ["", "Trips", 3], rescan: false })).toEqual({
      pages: ["", "Trips"],
    });
    expect(parseFilesChanged({ pages: [], rescan: true })).toEqual({ pages: null });
    expect(parseFilesChanged({ rescan: true })).toBeNull();
    expect(parseFilesChanged(null)).toBeNull();
  });
});
