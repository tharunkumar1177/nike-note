/**
 * Unit tests for workspace state validation and the derived setup stage.
 */
import { describe, expect, it } from "vitest";

import {
  parseCreatedDir,
  parseDirListing,
  parseWorkspace,
  setupStage,
  type GitState,
  type WorkspaceState,
} from "../src/shared/workspace";

/** A Git state for a fully set-up notes folder. */
const readyGit: GitState = {
  available: true,
  version: "2.51.0",
  isRepo: true,
  branch: "main",
  hasCommits: true,
  origin: "https://example.com/notes.git",
  upstream: "origin/main",
  identity: { name: "Ana Writer", email: "ana@example.com" },
};

/**
 * A workspace with a notes folder and the given Git fields.
 */
function workspaceWith(git: Partial<GitState> | null): WorkspaceState {
  return {
    root: "/home/ana/notes",
    rootName: "notes",
    rootError: null,
    git: git === null ? null : { ...readyGit, ...git },
  };
}

describe("parseWorkspace", () => {
  it("accepts a workspace without a notes folder", () => {
    expect(parseWorkspace({ root: null, rootName: null, rootError: null, git: null })).toEqual({
      root: null,
      rootName: null,
      rootError: null,
      git: null,
    });
  });

  it("accepts a full Git state", () => {
    expect(
      parseWorkspace({ root: "/n", rootName: "n", rootError: null, git: readyGit }).git,
    ).toEqual(readyGit);
  });

  it("fills missing Git fields when Git is unavailable", () => {
    expect(
      parseWorkspace({ root: "/n", rootName: "n", rootError: null, git: { available: false } })
        .git,
    ).toEqual({
      available: false,
      version: null,
      isRepo: false,
      branch: null,
      hasCommits: false,
      origin: null,
      upstream: null,
      identity: null,
    });
  });

  it("rejects malformed states", () => {
    expect(() => parseWorkspace(null)).toThrow(TypeError);
    expect(() => parseWorkspace({ root: 3 })).toThrow(TypeError);
    expect(() => parseWorkspace({ root: "/n", git: { available: "yes" } })).toThrow(TypeError);
  });
});

describe("parseDirListing", () => {
  it("accepts a listing and drops non-string roots", () => {
    expect(
      parseDirListing({
        path: "/home/ana",
        parent: "/home",
        home: "/home/ana",
        roots: ["/", 4],
        entries: [{ name: "notes", path: "/home/ana/notes", isRepo: true }],
      }),
    ).toEqual({
      path: "/home/ana",
      parent: "/home",
      home: "/home/ana",
      roots: ["/"],
      entries: [{ name: "notes", path: "/home/ana/notes", isRepo: true }],
    });
  });

  it("rejects listings with invalid entries", () => {
    expect(() => parseDirListing({ path: "/", roots: [], entries: [{ name: 1 }] })).toThrow(
      TypeError,
    );
    expect(() => parseDirListing({ path: "/" })).toThrow(TypeError);
  });
});

describe("parseCreatedDir", () => {
  it("returns the created path", () => {
    expect(parseCreatedDir({ path: "/home/ana/notes" })).toBe("/home/ana/notes");
    expect(() => parseCreatedDir({})).toThrow(TypeError);
  });
});

describe("setupStage", () => {
  it("asks for a folder until one is usable", () => {
    expect(setupStage({ root: null, rootName: null, rootError: null, git: null })).toBe("folder");
    expect(setupStage({ ...workspaceWith({}), rootError: "The folder is gone." })).toBe("folder");
    expect(setupStage(workspaceWith(null))).toBe("folder");
  });

  it("walks the Git steps in order", () => {
    expect(setupStage(workspaceWith({ available: false }))).toBe("git-missing");
    expect(setupStage(workspaceWith({ isRepo: false, identity: null }))).toBe("init");
    expect(setupStage(workspaceWith({ identity: null, origin: null }))).toBe("identity");
    expect(setupStage(workspaceWith({ origin: null, upstream: null }))).toBe("origin");
    expect(setupStage(workspaceWith({ upstream: null }))).toBe("publish");
    expect(setupStage(workspaceWith({}))).toBe("ready");
  });
});
