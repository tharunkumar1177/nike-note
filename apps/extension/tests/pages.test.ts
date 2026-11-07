/**
 * Unit tests for page tree validation, lookups, and page URL fragments.
 */
import { describe, expect, it } from "vitest";

import {
  findPage,
  isAncestor,
  pageHash,
  pageTrail,
  parseCreatedPage,
  parsePageTree,
  pathFromHash,
  type PageNode,
} from "../src/shared/pages";

/**
 * A page node with the given children.
 */
function node(path: string, title: string, children: PageNode[] = []): PageNode {
  return { path, name: path.split("/").at(-1) ?? "", title, hasReadme: true, children };
}

const japan = node("Trips/Japan 2027", "Japan 2027");
const trips = node("Trips", "My trips", [japan]);
const root = node("", "Home", [trips, node("Recipes", "Recipes")]);

describe("parsePageTree", () => {
  it("accepts a nested tree", () => {
    expect(parsePageTree({ root, truncated: false })).toEqual({ root, truncated: false });
  });

  it("treats a missing truncated flag as false", () => {
    expect(parsePageTree({ root }).truncated).toBe(false);
  });

  it("rejects malformed nodes at any depth", () => {
    expect(() => parsePageTree(null)).toThrow(TypeError);
    expect(() => parsePageTree({ root: { ...root, title: 3 } })).toThrow(TypeError);
    expect(() =>
      parsePageTree({ root: { ...root, children: [{ ...trips, children: [{ path: "x" }] }] } }),
    ).toThrow(TypeError);
  });

  it("rejects trees deeper than the helper ever sends", () => {
    let deep: PageNode = node("leaf", "Leaf");
    for (let depth = 0; depth < 70; depth += 1) deep = node("d", "D", [deep]);
    expect(() => parsePageTree({ root: deep })).toThrow(TypeError);
  });
});

describe("parseCreatedPage", () => {
  it("accepts a new page and rejects anything else", () => {
    const page = { path: "Trips/Untitled", folder: "Untitled", title: "Untitled" };
    expect(parseCreatedPage(page)).toEqual(page);
    expect(() => parseCreatedPage({ ...page, folder: "" })).toThrow(TypeError);
    expect(() => parseCreatedPage({ ...page, path: "Trips/Other" })).toThrow(TypeError);
    expect(() => parseCreatedPage({ path: "Untitled" })).toThrow(TypeError);
  });
});

describe("pageTrail and findPage", () => {
  it("walks from the root by folder name", () => {
    expect(pageTrail(root, "Trips/Japan 2027").map((page) => page.title)).toEqual([
      "Home",
      "My trips",
      "Japan 2027",
    ]);
    expect(findPage(root, "")).toBe(root);
    expect(findPage(root, "Recipes")?.title).toBe("Recipes");
  });

  it("returns nothing for unknown pages", () => {
    expect(pageTrail(root, "Trips/Rome")).toEqual([]);
    expect(findPage(root, "Nope")).toBeNull();
  });
});

describe("isAncestor", () => {
  it("matches whole folder segments only", () => {
    expect(isAncestor("", "Trips")).toBe(true);
    expect(isAncestor("Trips", "Trips/Japan 2027")).toBe(true);
    expect(isAncestor("Trips", "Trips")).toBe(false);
    expect(isAncestor("Trip", "Trips/Japan 2027")).toBe(false);
    expect(isAncestor("", "")).toBe(false);
  });
});

describe("page fragments", () => {
  it("round-trips paths with spaces and symbols", () => {
    for (const path of ["", "Trips", "Trips/Japan 2027", "Notes #1/50% done"]) {
      expect(pathFromHash(pageHash(path))).toBe(path);
    }
    expect(pageHash("Trips/Japan 2027")).toBe("#/Trips/Japan%202027");
  });

  it("opens the root page for empty or malformed fragments", () => {
    expect(pathFromHash("")).toBe("");
    expect(pathFromHash("#")).toBe("");
    expect(pathFromHash("#/%E0%A4%A")).toBe("");
  });
});
