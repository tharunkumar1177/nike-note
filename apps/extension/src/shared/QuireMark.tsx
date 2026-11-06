/**
 * The Quire mark as inline SVG, matching the generated PNG icons.
 */

/**
 * Render the mark at a pixel size. Decorative unless a label is given.
 */
export function QuireMark({ size, label }: { size: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <rect width="100" height="100" rx="22" fill="#252320" />
      <circle cx="47" cy="47" r="24" fill="none" stroke="#f7f6f3" strokeWidth="10" />
      <line
        x1="58"
        y1="58"
        x2="75"
        y2="75"
        stroke="#f7f6f3"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </svg>
  );
}
