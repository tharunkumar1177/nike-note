import { describe, expect, it } from "vitest";

import {
  QUIRE_ERROR_CODES,
  QuireError,
  isQuireError,
  type QuireErrorCode,
} from "../src/errors.js";

const EXPECTED_CODES: QuireErrorCode[] = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION",
  "RATE_LIMITED",
  "INTERNAL",
];

describe("QUIRE_ERROR_CODES", () => {
  it("defines the shared architecture error code set", () => {
    expect(Object.keys(QUIRE_ERROR_CODES).sort()).toEqual(
      [...EXPECTED_CODES].sort(),
    );

    for (const code of EXPECTED_CODES) {
      expect(QUIRE_ERROR_CODES[code]).toBe(code);
    }
  });
});

describe("QuireError", () => {
  it("carries code and message", () => {
    const error = new QuireError(
      QUIRE_ERROR_CODES.NOT_FOUND,
      "Block not found",
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(QuireError);
    expect(error.name).toBe("QuireError");
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("Block not found");
  });
});

describe("isQuireError", () => {
  it("returns true for QuireError instances", () => {
    const error = new QuireError(
      QUIRE_ERROR_CODES.FORBIDDEN,
      "Access denied",
    );

    expect(isQuireError(error)).toBe(true);
  });

  it("returns false for other values", () => {
    expect(isQuireError(new Error("generic"))).toBe(false);
    expect(isQuireError({ code: "INTERNAL", message: "plain object" })).toBe(
      false,
    );
    expect(isQuireError(null)).toBe(false);
    expect(isQuireError(undefined)).toBe(false);
  });
});
