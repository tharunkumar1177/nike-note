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

/** Check mark. */
export function CheckIcon() {
  return (
    <svg {...iconProps} strokeWidth={2}>
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}
