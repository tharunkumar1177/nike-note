/**
 * Builds the Manifest V3 document for the extension. The public key fixes the
 * extension ID (see architecture.md, Extension identity), and the visual page
 * is declared as a sandbox with its own policy (see architecture.md, Visual
 * blocks).
 */
import { VISUAL_CSP, VISUAL_PAGE } from "../shared/visual";

/** DER-encoded SubjectPublicKeyInfo, base64. Its SHA-256 yields the extension ID. */
export const EXTENSION_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0N3hu895vvqBN7raUF/vHO+xpn7ZH9HkOALbEBpRuLU5u68TKdqNqC6dMP1dPaqMM8wUi3AHRW2Y2n73htMzYjLFllO5UnIRZEHR35Mxp175w7CzORO8PVK8pOYhU2U1xHxBXx7q72c7a1kxHdr+4edtWEB+XYWLobXi6xCE5QcIxGPAkcxV00UXW/GIIYZBtAyToVMqKp70ynLNUj7yyGHfq/JbtDoCoWzmYvGAmHXBsrPm1xKioKbwYp8rabAO9oMpp7jaMosk8XHVAFULKeczKMZuDLQRQyDWGKrv+2eKPjCoZvukI7MSNRbcZbreJ/jmfvXwTS8wOWz1vidaVQIDAQAB";

/** Icon sizes emitted into `icons/icon-<size>.png`. */
export const ICON_SIZES = [16, 32, 48, 128] as const;

/**
 * Map each icon size to its output path.
 */
function iconSet(sizes: readonly number[]): Record<string, string> {
  return Object.fromEntries(
    sizes.map((size) => [String(size), `icons/icon-${size}.png`]),
  );
}

/**
 * Create the manifest for a release version taken from package.json.
 */
export function buildManifest(version: string): Record<string, unknown> {
  if (!/^\d+(\.\d+){0,3}$/.test(version)) {
    throw new Error(`Extension version "${version}" is not a valid Chrome version`);
  }
  return {
    manifest_version: 3,
    name: "Quire",
    short_name: "Quire",
    description:
      "Notion-style pages stored as Markdown files on your computer, synced with Git.",
    version,
    minimum_chrome_version: "116",
    key: EXTENSION_PUBLIC_KEY,
    action: {
      default_title: "Quire",
      default_popup: "popup.html",
      default_icon: iconSet([16, 32]),
    },
    icons: iconSet(ICON_SIZES),
    permissions: ["nativeMessaging", "storage"],
    sandbox: { pages: [VISUAL_PAGE] },
    content_security_policy: { sandbox: VISUAL_CSP },
  };
}
