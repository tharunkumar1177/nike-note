/**
 * Unit tests for the search result validator, query words, and highlighting.
 */
import { describe, expect, it } from "vitest";

import { highlight, parseSearchResult, queryWords } from "../src/shared/search";

describe("parseSearchResult", () => {
  it("accepts results and flags", () => {
    const hit = { path: "Trips/Kyoto", title: "Kyoto", snippet: "Day 1" };
    expect(parseSearchResult({ results: [hit], truncated: true })).toEqual({
      results: [hit],
      truncated: true,
      superseded: false,
    });
    expect(parseSearchResult({ results: [], truncated: false, superseded: true }).superseded).toBe(
      true,
    );
  });

  it("rejects malformed results", () => {
    expect(() => parseSearchResult(null)).toThrow(TypeError);
    expect(() => parseSearchResult({ results: "none" })).toThrow(TypeError);
    expect(() => parseSearchResult({ results: [{ path: "", title: "Home" }] })).toThrow(TypeError);
  });
});

describe("queryWords", () => {
  it("lowercases, splits on spaces, and keeps eight words", () => {
    expect(queryWords("  Kyoto TRIP ")).toEqual(["kyoto", "trip"]);
    expect(queryWords("a b c d e f g h i j")).toHaveLength(8);
    expect(queryWords("   ")).toEqual([]);
  });
});

describe("highlight", () => {
  it("marks every occurrence without regard to case", () => {
    expect(highlight("Plan the Kyoto trip, kyoto!", ["kyoto"])).toEqual([
      { text: "Plan the ", match: false },
      { text: "Kyoto", match: true },
      { text: " trip, ", match: false },
      { text: "kyoto", match: true },
      { text: "!", match: false },
    ]);
  });

  it("merges overlapping matches and handles no words", () => {
    expect(highlight("trips", ["trip", "ips"])).toEqual([{ text: "trips", match: true }]);
    expect(highlight("Home", [])).toEqual([{ text: "Home", match: false }]);
    expect(highlight("", ["a"])).toEqual([]);
  });
});
