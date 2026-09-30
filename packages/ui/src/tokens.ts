/** Ten highlight colors shared by text and background tokens (Notion-style palette). */
export const NAMED_COLORS = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

export type NamedColor = (typeof NAMED_COLORS)[number];

export type ColorScale = Record<NamedColor, string>;

export interface SemanticColorTokens {
  page: string;
  surface: string;
  surfaceRaised: string;
  divider: string;
  border: string;
  icon: string;
  iconSecondary: string;
  hover: string;
  active: string;
  focusRing: string;
}

export interface ColorTokens {
  text: ColorScale;
  background: ColorScale;
  semantic: SemanticColorTokens;
}

export interface TypographyTokens {
  fontFamily: {
    sans: string;
    serif: string;
    mono: string;
  };
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    "2xl": string;
    "3xl": string;
  };
  fontWeight: {
    regular: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  lineHeight: {
    tight: number;
    snug: number;
    normal: number;
    relaxed: number;
  };
  letterSpacing: {
    tight: string;
    normal: string;
    wide: string;
  };
}

export interface SpacingTokens {
  px: string;
  0: string;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: string;
  8: string;
  10: string;
  12: string;
  16: string;
  20: string;
  24: string;
}

export interface RadiusTokens {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

export interface ShadowTokens {
  sm: string;
  md: string;
  lg: string;
  popover: string;
}

export interface ZIndexTokens {
  base: number;
  sticky: number;
  dropdown: number;
  overlay: number;
  modal: number;
  toast: number;
  tooltip: number;
}

export interface MotionTokens {
  duration: {
    instant: string;
    fast: string;
    normal: string;
    slow: string;
  };
  easing: {
    standard: string;
    emphasized: string;
    decelerate: string;
    accelerate: string;
  };
}

export interface ThemeTokens {
  color: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadow: ShadowTokens;
  zIndex: ZIndexTokens;
  motion: MotionTokens;
}

const sharedTypography: TypographyTokens = {
  fontFamily: {
    sans:
      'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
    serif:
      'Lyon-Text, Georgia, "Times New Roman", ui-serif, serif',
    mono:
      'iAWriterMono, "SFMono-Regular", SF Mono, Menlo, Consolas, "PT Mono", "Liberation Mono", Courier, monospace',
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.625,
  },
  letterSpacing: {
    tight: "-0.01em",
    normal: "0",
    wide: "0.02em",
  },
};

const sharedSpacing: SpacingTokens = {
  px: "1px",
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
};

const sharedRadius: RadiusTokens = {
  sm: "3px",
  md: "4px",
  lg: "6px",
  xl: "8px",
  full: "9999px",
};

const sharedZIndex: ZIndexTokens = {
  base: 0,
  sticky: 10,
  dropdown: 100,
  overlay: 200,
  modal: 300,
  toast: 400,
  tooltip: 500,
};

const sharedMotion: MotionTokens = {
  duration: {
    instant: "0ms",
    fast: "150ms",
    normal: "200ms",
    slow: "300ms",
  },
  easing: {
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    emphasized: "cubic-bezier(0.2, 0, 0, 1)",
    decelerate: "cubic-bezier(0, 0, 0.2, 1)",
    accelerate: "cubic-bezier(0.4, 0, 1, 1)",
  },
};

/** Light theme aligned with Notion's warm, document-first palette. */
export const lightTheme: ThemeTokens = {
  color: {
    text: {
      default: "#37352f",
      gray: "#787774",
      brown: "#9f6b53",
      orange: "#d9730d",
      yellow: "#cb912f",
      green: "#448361",
      blue: "#337ea9",
      purple: "#9065b0",
      pink: "#c14c8a",
      red: "#d44c47",
    },
    background: {
      default: "#ffffff",
      gray: "#f1f1ef",
      brown: "#f4eeee",
      orange: "#faebdd",
      yellow: "#fbf3db",
      green: "#edf3ec",
      blue: "#e7f3f8",
      purple: "#f4f0f7",
      pink: "#faf1f5",
      red: "#fdebec",
    },
    semantic: {
      page: "#ffffff",
      surface: "#f7f6f3",
      surfaceRaised: "#ffffff",
      divider: "rgba(55, 53, 47, 0.09)",
      border: "rgba(55, 53, 47, 0.16)",
      icon: "rgba(55, 53, 47, 0.45)",
      iconSecondary: "rgba(55, 53, 47, 0.35)",
      hover: "rgba(55, 53, 47, 0.08)",
      active: "rgba(55, 53, 47, 0.16)",
      focusRing: "rgba(35, 131, 226, 0.57)",
    },
  },
  typography: sharedTypography,
  spacing: sharedSpacing,
  radius: sharedRadius,
  shadow: {
    sm: "0 1px 2px rgba(15, 15, 15, 0.05)",
    md: "0 4px 12px rgba(15, 15, 15, 0.08)",
    lg: "0 12px 32px rgba(15, 15, 15, 0.12)",
    popover: "0 0 0 1px rgba(15, 15, 15, 0.05), 0 3px 6px rgba(15, 15, 15, 0.1), 0 9px 24px rgba(15, 15, 15, 0.2)",
  },
  zIndex: sharedZIndex,
  motion: sharedMotion,
};

/** Dark theme aligned with Notion's low-contrast, warm dark surfaces. */
export const darkTheme: ThemeTokens = {
  color: {
    text: {
      default: "rgba(255, 255, 255, 0.81)",
      gray: "#9b9a97",
      brown: "#a27766",
      orange: "#ffa344",
      yellow: "#ffdc49",
      green: "#4dab9a",
      blue: "#529cca",
      purple: "#9a6dd7",
      pink: "#e255a1",
      red: "#ff7369",
    },
    background: {
      default: "#191919",
      gray: "#252525",
      brown: "#2f2724",
      orange: "#3a2e22",
      yellow: "#3a3520",
      green: "#243a32",
      blue: "#1f2f3a",
      purple: "#302438",
      pink: "#3a2430",
      red: "#3a2424",
    },
    semantic: {
      page: "#191919",
      surface: "#202020",
      surfaceRaised: "#2a2a2a",
      divider: "rgba(255, 255, 255, 0.094)",
      border: "rgba(255, 255, 255, 0.13)",
      icon: "rgba(255, 255, 255, 0.45)",
      iconSecondary: "rgba(255, 255, 255, 0.35)",
      hover: "rgba(255, 255, 255, 0.055)",
      active: "rgba(255, 255, 255, 0.13)",
      focusRing: "rgba(35, 131, 226, 0.57)",
    },
  },
  typography: sharedTypography,
  spacing: sharedSpacing,
  radius: sharedRadius,
  shadow: {
    sm: "0 1px 2px rgba(0, 0, 0, 0.2)",
    md: "0 4px 12px rgba(0, 0, 0, 0.35)",
    lg: "0 12px 32px rgba(0, 0, 0, 0.45)",
    popover: "0 0 0 1px rgba(255, 255, 255, 0.06), 0 3px 6px rgba(0, 0, 0, 0.35), 0 9px 24px rgba(0, 0, 0, 0.5)",
  },
  zIndex: sharedZIndex,
  motion: sharedMotion,
};

export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

export type ThemeName = keyof typeof themes;
