/**
 * Small inline SVG icons used across the app. All are decorative.
 */

/** Shared props for 16-pixel stroke icons. */
const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: "false" as const,
};

/** Closed folder. */
export function FolderIcon() {
  return (
    <svg {...iconProps}>
      <path d="M1.75 4.25a1 1 0 0 1 1-1h3.1l1.4 1.5h5.999a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" />
    </svg>
  );
}

/** Arrow pointing up, for "parent folder". */
export function ArrowUpIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
    </svg>
  );
}

/** House, for the home folder. */
export function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2.5 7 8 2.5 13.5 7v6a.5.5 0 0 1-.5.5h-3v-4H6v4H3a.5.5 0 0 1-.5-.5z" />
    </svg>
  );
}

/** Plus sign. */
export function PlusIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

/** Three dots in a row, for a menu of more actions. */
export function MoreIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3.5 8h.01M8 8h.01M12.5 8h.01" strokeWidth={2.5} />
    </svg>
  );
}

/** Page (a document with a folded corner). */
export function PageIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 1.75h5.25L12.5 5v9.25H4z" />
      <path d="M9 1.75V5.25h3.5" />
    </svg>
  );
}

/** Chevron pointing right; rotated by CSS when expanded. */
export function ChevronIcon() {
  return (
    <svg {...iconProps} width={12} height={12}>
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

/** Git branch. */
export function BranchIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="4.5" cy="3.5" r="1.5" />
      <circle cx="4.5" cy="12.5" r="1.5" />
      <circle cx="11.5" cy="5.5" r="1.5" />
      <path d="M4.5 5v6M11.5 7c0 2.5-3 2.5-7 4" />
    </svg>
  );
}

/** Magnifying glass, for search. */
export function SearchIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.25 3.25" />
    </svg>
  );
}

/** Four-pointed sparkle, for AI actions. */
export function SparkleIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 1.75c.4 3.1 2.15 4.85 5.25 5.25-3.1.4-4.85 2.15-5.25 5.25C7.6 9.15 5.85 7.4 2.75 7 5.85 6.6 7.6 4.85 8 1.75z" />
      <path d="M12.75 11.5v2.5M11.5 12.75H14" />
    </svg>
  );
}

/** Two sliders, for settings. */
export function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2.5 5h6.25M12.25 5h1.25M2.5 11h1.25M7.25 11h6.25" />
      <circle cx="10.5" cy="5" r="1.75" />
      <circle cx="5.5" cy="11" r="1.75" />
    </svg>
  );
}

/** Check mark. */
export function CheckIcon() {
  return (
    <svg {...iconProps} strokeWidth={2}>
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}
