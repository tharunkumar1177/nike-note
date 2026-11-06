/**
 * Bottom status bar: helper connection now; Git state joins it in later slices.
 */
import type { HelloResult } from "../shared/protocol";
import { osLabel } from "../shared/platform";

/**
 * Render the status bar for a connected helper.
 */
export function StatusBar({ hello }: { hello: HelloResult }) {
  return (
    <footer className="status-bar" aria-label="Status">
      <span
        className="status-bar__item"
        title={`Quire Helper ${hello.helperVersion} on ${osLabel(hello.os)} (${hello.arch})`}
      >
        <span className="status-dot status-dot--ok" aria-hidden="true" />
        Helper {hello.helperVersion}
      </span>
    </footer>
  );
}
