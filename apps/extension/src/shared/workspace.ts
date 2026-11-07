/**
 * Notes-folder and Git state returned by the helper, its validators, and the
 * setup stage derived from it (see blueprints/workspace-setup.md).
 */
import { isRecord } from "./protocol";

/** Git state of the notes folder. Fields other than `available` are absent when Git cannot run. */
export interface GitState {
  available: boolean;
  version: string | null;
  isRepo: boolean;
  branch: string | null;
  hasCommits: boolean;
  origin: string | null;
  upstream: string | null;
  identity: { name: string; email: string } | null;
}

/** The chosen notes folder and its Git state. */
export interface WorkspaceState {
  root: string | null;
  rootName: string | null;
  rootError: string | null;
  git: GitState | null;
}

/** One subfolder in a folder listing. */
export interface DirEntry {
  name: string;
  path: string;
  isRepo: boolean;
}

/** A folder listing used by the folder picker. */
export interface DirListing {
  path: string;
  parent: string | null;
  home: string | null;
  roots: string[];
  entries: DirEntry[];
}

/** Where the user is in the setup flow. */
export type SetupStage =
  | "folder"
  | "git-missing"
  | "init"
  | "identity"
  | "origin"
  | "publish"
  | "ready";

/**
 * Read a string or null field; anything else is invalid.
 */
function stringOrNull(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : undefined;
}

/**
 * Validate the Git part of a workspace state.
 */
function parseGit(value: unknown): GitState | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.available !== "boolean") {
    throw new TypeError("The helper sent an invalid Git state.");
  }
  const identity = value.identity;
  const parsedIdentity =
    isRecord(identity) && typeof identity.name === "string" && typeof identity.email === "string"
      ? { name: identity.name, email: identity.email }
      : null;
  return {
    available: value.available,
    version: stringOrNull(value.version) ?? null,
    isRepo: value.isRepo === true,
    branch: stringOrNull(value.branch) ?? null,
    hasCommits: value.hasCommits === true,
    origin: stringOrNull(value.origin) ?? null,
    upstream: stringOrNull(value.upstream) ?? null,
    identity: parsedIdentity,
  };
}

/**
 * Validate a workspace state from `getWorkspace`, `setRoot`, and the Git setup methods.
 */
export function parseWorkspace(value: unknown): WorkspaceState {
  if (!isRecord(value)) throw new TypeError("The helper sent an invalid workspace state.");
  const root = stringOrNull(value.root);
  const rootName = stringOrNull(value.rootName);
  const rootError = stringOrNull(value.rootError);
  if (root === undefined || rootName === undefined || rootError === undefined) {
    throw new TypeError("The helper sent an invalid workspace state.");
  }
  return { root, rootName, rootError, git: parseGit(value.git ?? null) };
}

/**
 * Validate a folder listing from `listDirs`.
 */
export function parseDirListing(value: unknown): DirListing {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    !Array.isArray(value.roots) ||
    !Array.isArray(value.entries)
  ) {
    throw new TypeError("The helper sent an invalid folder listing.");
  }
  const entries = value.entries.map((entry: unknown): DirEntry => {
    if (
      !isRecord(entry) ||
      typeof entry.name !== "string" ||
      typeof entry.path !== "string"
    ) {
      throw new TypeError("The helper sent an invalid folder entry.");
    }
    return { name: entry.name, path: entry.path, isRepo: entry.isRepo === true };
  });
  return {
    path: value.path,
    parent: stringOrNull(value.parent) ?? null,
    home: stringOrNull(value.home) ?? null,
    roots: value.roots.filter((root: unknown): root is string => typeof root === "string"),
    entries,
  };
}

/**
 * Validate the result of `createDir`.
 */
export function parseCreatedDir(value: unknown): string {
  if (isRecord(value) && typeof value.path === "string") return value.path;
  throw new TypeError("The helper sent an invalid folder.");
}

/**
 * The next setup step for a workspace, or `ready` when the folder syncs.
 */
export function setupStage(workspace: WorkspaceState): SetupStage {
  const { git } = workspace;
  if (!workspace.root || workspace.rootError || !git) return "folder";
  if (!git.available) return "git-missing";
  if (!git.isRepo) return "init";
  if (!git.identity) return "identity";
  if (!git.origin) return "origin";
  if (!git.upstream) return "publish";
  return "ready";
}
