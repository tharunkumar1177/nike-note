/**
 * Detects the user's operating system to show matching helper install steps.
 */

/** Operating systems with their own install instructions. */
export type DesktopOs = "windows" | "macos" | "linux";

/**
 * Detect the desktop OS from the browser's user agent string.
 */
export function detectOs(userAgent: string): DesktopOs {
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macos";
  return "linux";
}

/**
 * Human-readable OS name for the helper's reported `os` value.
 */
export function osLabel(os: string): string {
  switch (os) {
    case "windows":
      return "Windows";
    case "macos":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return os;
  }
}
