/**
 * Tests for reading appearance settings and turning them into root element
 * attributes.
 */
import { describe, expect, it } from "vitest";

import {
  appearanceAttributes,
  DEFAULT_APPEARANCE,
  parseAppearance,
  readAppearance,
} from "../src/shared/appearance";

describe("parseAppearance", () => {
  it("accepts complete settings", () => {
    const settings = { theme: "dark", font: "serif", fullWidth: true };
    expect(parseAppearance(settings)).toEqual(settings);
  });

  it("falls back per field, keeping the valid ones", () => {
    expect(parseAppearance({ theme: "sepia", font: "mono", fullWidth: "yes" })).toEqual({
      theme: "system",
      font: "mono",
      fullWidth: false,
    });
    expect(parseAppearance({ theme: "light" })).toEqual({ ...DEFAULT_APPEARANCE, theme: "light" });
  });

  it("uses the defaults for anything that is not an object", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("dark")).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("readAppearance", () => {
  it("reads saved JSON text", () => {
    expect(readAppearance('{"theme":"dark","font":"default","fullWidth":false}').theme).toBe(
      "dark",
    );
  });

  it("uses the defaults when nothing usable is saved", () => {
    expect(readAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(readAppearance("{broken")).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("appearanceAttributes", () => {
  it("removes every attribute for the defaults", () => {
    expect(appearanceAttributes(DEFAULT_APPEARANCE)).toEqual({
      "data-theme": null,
      "data-font": null,
      "data-full-width": null,
    });
  });

  it("sets the chosen theme, font, and full width", () => {
    expect(appearanceAttributes({ theme: "light", font: "mono", fullWidth: true })).toEqual({
      "data-theme": "light",
      "data-font": "mono",
      "data-full-width": "",
    });
  });
});
