import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { QUIRE_ERROR_CODES, QuireError, isQuireError } from "@quire/core";

import { createDb } from "../src/client.js";
import { readDatabaseUrl } from "../src/env.js";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    throw new Error(
      "DATABASE_URL is required for @quire/db integration tests (CI must provide a Postgres service URL)",
    );
  }
  return url;
}

describe("readDatabaseUrl", () => {
  it("throws VALIDATION when DATABASE_URL is missing", () => {
    expect(() => readDatabaseUrl({})).toThrow(QuireError);

    try {
      readDatabaseUrl({});
    } catch (error) {
      expect(isQuireError(error)).toBe(true);
      if (isQuireError(error)) {
        expect(error.code).toBe(QUIRE_ERROR_CODES.VALIDATION);
        expect(error.message).toBe("DATABASE_URL is required");
      }
    }
  });

  it("throws VALIDATION when DATABASE_URL is empty or whitespace", () => {
    for (const value of ["", "   ", "\t"]) {
      expect(() => readDatabaseUrl({ DATABASE_URL: value })).toThrow(QuireError);
    }
  });

  it("throws VALIDATION when DATABASE_URL is not a PostgreSQL URL", () => {
    for (const value of [
      "mysql://localhost/db",
      "http://localhost:5432/db",
      "not-a-url",
    ]) {
      try {
        readDatabaseUrl({ DATABASE_URL: value });
        expect.unreachable("expected readDatabaseUrl to throw");
      } catch (error) {
        expect(isQuireError(error)).toBe(true);
        if (isQuireError(error)) {
          expect(error.code).toBe(QUIRE_ERROR_CODES.VALIDATION);
        }
      }
    }
  });

  it("accepts postgres:// and postgresql:// URLs", () => {
    expect(
      readDatabaseUrl({
        DATABASE_URL: "postgres://user:pass@localhost:5432/quire",
      }),
    ).toBe("postgres://user:pass@localhost:5432/quire");

    expect(
      readDatabaseUrl({
        DATABASE_URL: "  postgresql://user:pass@localhost:5432/quire  ",
      }),
    ).toBe("postgresql://user:pass@localhost:5432/quire");
  });
});

describe("createDb integration", () => {
  it("connects, runs select 1, and closes cleanly", async () => {
    const url = requireDatabaseUrl();
    const { db, close } = createDb(url);

    try {
      const rows = await db.execute(sql`select 1 as value`);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ value: 1 });
    } finally {
      await close();
    }
  });
});
