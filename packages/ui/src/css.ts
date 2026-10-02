import {
  NAMED_COLORS,
  type ThemeTokens,
  darkTheme,
  lightTheme,
} from "./tokens.js";

const CSS_VAR_PREFIX = "quire";

function cssVarName(...segments: string[]): string {
  return `--${CSS_VAR_PREFIX}-${segments.join("-")}`;
}

/** Flat map of CSS custom property names to values for one theme. */
export function themeToCssVariables(theme: ThemeTokens): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const color of NAMED_COLORS) {
    variables[cssVarName("color", "text", color)] = theme.color.text[color];
    variables[cssVarName("color", "bg", color)] = theme.color.background[color];
  }

  for (const [key, value] of Object.entries(theme.color.semantic)) {
    variables[cssVarName("color", key)] = value;
  }

  for (const [key, value] of Object.entries(theme.typography.fontFamily)) {
    variables[cssVarName("font-family", key)] = value;
  }

  for (const [key, value] of Object.entries(theme.typography.fontSize)) {
    variables[cssVarName("font-size", key)] = value;
  }

  for (const [key, value] of Object.entries(theme.typography.fontWeight)) {
    variables[cssVarName("font-weight", key)] = String(value);
  }

  for (const [key, value] of Object.entries(theme.typography.lineHeight)) {
    variables[cssVarName("line-height", key)] = String(value);
  }

  for (const [key, value] of Object.entries(theme.typography.letterSpacing)) {
    variables[cssVarName("letter-spacing", key)] = value;
  }

  for (const [key, value] of Object.entries(theme.spacing)) {
    variables[cssVarName("space", key)] = value;
  }

  for (const [key, value] of Object.entries(theme.radius)) {
    variables[cssVarName("radius", key)] = value;
  }

  for (const [key, value] of Object.entries(theme.shadow)) {
    variables[cssVarName("shadow", key)] = value;
  }

  for (const [key, value] of Object.entries(theme.zIndex)) {
    variables[cssVarName("z", key)] = String(value);
  }

  for (const [key, value] of Object.entries(theme.motion.duration)) {
    variables[cssVarName("motion-duration", key)] = value;
  }

  for (const [key, value] of Object.entries(theme.motion.easing)) {
    variables[cssVarName("motion-easing", key)] = value;
  }

  return variables;
}

function renderVariableBlock(variables: Record<string, string>): string {
  return Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
}

/**
 * Render design tokens as CSS custom properties for `:root` (light),
 * `[data-theme="dark"]`, and a `prefers-color-scheme: dark` fallback.
 */
export function renderTokenCss(): string {
  const lightVariables = themeToCssVariables(lightTheme);
  const darkVariables = themeToCssVariables(darkTheme);
  const lightBlock = renderVariableBlock(lightVariables);
  const darkBlock = renderVariableBlock(darkVariables);

  return [
    ":root,",
    '[data-theme="light"] {',
    lightBlock,
    "}",
    "",
    '[data-theme="dark"] {',
    darkBlock,
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    '  :root:not([data-theme="light"]) {',
    darkBlock,
    "  }",
    "}",
    "",
    "@media (prefers-reduced-motion: reduce) {",
    "  :root {",
    `    ${cssVarName("motion-duration", "fast")}: 0ms;`,
    `    ${cssVarName("motion-duration", "normal")}: 0ms;`,
    `    ${cssVarName("motion-duration", "slow")}: 0ms;`,
    "  }",
    "}",
    "",
  ].join("\n");
}
