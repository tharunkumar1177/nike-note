import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_WORD_PATTERN,
  findViolations,
} from "../guard/forbidden-word.js";

const forbidden = "n" + "ike";

describe("forbidden word guard", () => {
  it("detects the word in file content", () => {
    const violations = findViolations([
      { path: "src/example.ts", content: `const brand = "${forbidden}";\n` },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      path: "src/example.ts",
      line: 1,
    });
  });

  it("detects case-insensitive matches", () => {
    const mixedCase = forbidden[0].toUpperCase() + forbidden.slice(1).toLowerCase();
    const violations = findViolations([
      { path: "readme.md", content: `${mixedCase} apparel\n` },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.match.toLowerCase()).toBe(forbidden);
  });

  it("detects the word in a file path", () => {
    const violations = findViolations([
      { path: `assets/${forbidden}-logo.png`, content: "" },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      path: `assets/${forbidden}-logo.png`,
      line: 0,
    });
  });

  it("reports the correct line number", () => {
    const violations = findViolations([
      {
        path: "notes.txt",
        content: `first line\nsecond has ${forbidden}\nthird line\n`,
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.line).toBe(2);
  });

  it("returns no violations for clean files", () => {
    const violations = findViolations([
      { path: "src/quire.ts", content: "export const product = 'Quire';\n" },
      { path: "packages/core/index.ts", content: "// shared domain types\n" },
    ]);

    expect(violations).toHaveLength(0);
  });

  it("exports a pattern that matches without spelling the word literally", () => {
    expect(FORBIDDEN_WORD_PATTERN.test(forbidden)).toBe(true);
    expect(FORBIDDEN_WORD_PATTERN.test("quire")).toBe(false);
  });
});
