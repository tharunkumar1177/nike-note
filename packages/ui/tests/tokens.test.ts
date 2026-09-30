import { describe, expect, it } from "vitest";

import { renderTokenCss, themeToCssVariables } from "../src/css.js";
import {
  NAMED_COLORS,
  darkTheme,
  lightTheme,
  themes,
} from "../src/tokens.js";

function parseRgb(color: string): [number, number, number] {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const value = hex[1];
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    ];
  }

  const rgb = color.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );
  if (rgb) {
    return [
      Number.parseFloat(rgb[1]),
      Number.parseFloat(rgb[2]),
      Number.parseFloat(rgb[3]),
    ];
  }

  throw new Error(`Unsupported color format: ${color}`);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(parseRgb(foreground));
  const bg = relativeLuminance(parseRgb(background));
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("named color tokens", () => {
  it("defines every named color for text and background in both themes", () => {
    for (const themeName of Object.keys(themes) as Array<keyof typeof themes>) {
      const theme = themes[themeName];

      for (const color of NAMED_COLORS) {
        expect(theme.color.text[color], `${themeName} text.${color}`).toBeTruthy();
        expect(
          theme.color.background[color],
          `${themeName} background.${color}`,
        ).toBeTruthy();
      }
    }
  });
});

describe("renderTokenCss", () => {
  it("emits every CSS variable for light and dark themes", () => {
    const css = renderTokenCss();
    const lightVariables = themeToCssVariables(lightTheme);
    const darkVariables = themeToCssVariables(darkTheme);

    for (const name of Object.keys(lightVariables)) {
      expect(css, `missing light variable ${name}`).toContain(`${name}:`);
    }

    for (const name of Object.keys(darkVariables)) {
      expect(css, `missing dark variable ${name}`).toContain(`${name}:`);
    }

    expect(css).toContain(':root,');
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

describe("default text contrast", () => {
  it("meets WCAG AA (>= 4.5:1) on default backgrounds", () => {
    for (const theme of [lightTheme, darkTheme]) {
      const ratio = contrastRatio(
        theme.color.text.default,
        theme.color.background.default,
      );

      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});
