/**
 * Full-page screens shown while the helper is connecting, missing, rejected,
 * outdated, or stopped (see blueprints/extension-shell.md).
 */
import { useState, type ReactNode } from "react";

import { EXTENSION_ID } from "../shared/identity";
import { detectOs, type DesktopOs } from "../shared/platform";
import { QuireMark } from "../shared/QuireMark";
import type { ConnectionState } from "./connection";

type FailedState = Exclude<ConnectionState, { status: "connected" }>;

/** Shell commands that install the helper from the Downloads folder. */
const INSTALL_COMMANDS: Record<Exclude<DesktopOs, "windows">, string> = {
  macos:
    "xattr -d com.apple.quarantine ~/Downloads/quire-helper; chmod +x ~/Downloads/quire-helper && ~/Downloads/quire-helper install",
  linux: "chmod +x ~/Downloads/quire-helper && ~/Downloads/quire-helper install",
};

/** Download file name per OS, matching the CI artifact names. */
const DOWNLOAD_NAMES: Record<DesktopOs, string> = {
  windows: "quire-helper-windows",
  macos: "quire-helper-macos",
  linux: "quire-helper-linux",
};

/**
 * A command line with a copy button.
 */
function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  /**
   * Copy the command and confirm briefly.
   */
  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="command">
      <code className="command__text">{command}</code>
      <button type="button" className="q-button command__copy" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/**
 * Ordered install steps for one OS.
 */
function InstallSteps({ os }: { os: DesktopOs }) {
  const download = DOWNLOAD_NAMES[os];
  return (
    <ol className="steps">
      <li>
        Get <strong>{download}</strong> from the same place you got Quire, and unzip it into
        your Downloads folder.
      </li>
      {os === "windows" ? (
        <li>
          Double-click <strong>quire-helper.exe</strong>. If Windows protects your PC, select{" "}
          <strong>More info</strong>, then <strong>Run anyway</strong>.
        </li>
      ) : (
        <li>
          Open {os === "macos" ? "Terminal" : "a terminal"} and run:
          <CommandLine command={INSTALL_COMMANDS[os]} />
        </li>
      )}
      <li>Come back to this tab. Quire connects automatically.</li>
    </ol>
  );
}

/**
 * Centered card layout shared by every connection screen.
 */
function ScreenCard({
  title,
  children,
  detail,
  onRetry,
}: {
  title: string;
  children: ReactNode;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <main className="screen">
      <section className="screen__card" aria-labelledby="screen-title">
        <QuireMark size={40} />
        <h1 id="screen-title" className="screen__title">
          {title}
        </h1>
        <div className="screen__body">{children}</div>
        {onRetry && (
          <div className="screen__actions">
            <button type="button" className="q-button q-button--primary" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
        {detail && (
          <details className="screen__detail">
            <summary>Technical details</summary>
            <code>{detail}</code>
          </details>
        )}
      </section>
    </main>
  );
}

/**
 * Pick the screen for a non-connected state.
 */
export function ConnectionScreen({
  state,
  onRetry,
}: {
  state: FailedState;
  onRetry: () => void;
}) {
  switch (state.status) {
    case "connecting":
      return (
        <main className="screen screen--connecting" aria-busy="true">
          <div className="connecting" role="status">
            <span className="connecting__spinner" aria-hidden="true" />
            Connecting to Quire Helper…
          </div>
        </main>
      );

    case "unsupported":
      return (
        <ScreenCard title="Open Quire from the browser toolbar">
          <p>
            This page works only inside the Quire extension. Select the Quire icon in the
            toolbar, then select <strong>Open Quire</strong>.
          </p>
        </ScreenCard>
      );

    case "missing":
      return (
        <ScreenCard title="Install Quire Helper" detail={state.detail} onRetry={onRetry}>
          <p>
            Quire keeps your notes in a folder on this computer. A small helper program reads
            and writes that folder and syncs it with Git. Install it once; it starts by itself
            whenever Quire is open.
          </p>
          <InstallSteps os={detectOs(navigator.userAgent)} />
        </ScreenCard>
      );

    case "forbidden":
      return (
        <ScreenCard
          title="Quire Helper doesn't recognize this extension"
          detail={state.detail}
          onRetry={onRetry}
        >
          <p>
            The installed helper accepts only the Quire extension with the ID{" "}
            <code>{EXTENSION_ID}</code>. Install the helper again, then select Retry.
          </p>
          <InstallSteps os={detectOs(navigator.userAgent)} />
        </ScreenCard>
      );

    case "outdated":
      return (
        <ScreenCard title="Update Quire Helper" detail={state.detail} onRetry={onRetry}>
          <p>
            The installed helper is a different version from this extension. Install the
            helper that matches this version of Quire, then select Retry.
          </p>
          <InstallSteps os={detectOs(navigator.userAgent)} />
        </ScreenCard>
      );

    case "stopped":
      return (
        <ScreenCard title="Quire Helper stopped" detail={state.detail} onRetry={onRetry}>
          <p>
            The connection to the helper closed unexpectedly. Select Retry to start it again.
            Your notes are safe on disk.
          </p>
        </ScreenCard>
      );
  }
}
