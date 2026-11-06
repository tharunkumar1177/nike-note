/**
 * Toolbar popup: the Quire name, a one-line description, and Open Quire.
 */
import { useState } from "react";

import { QuireMark } from "../shared/QuireMark";
import { openOrFocusApp } from "./openApp";

/**
 * Render the popup and open or focus the app page on click.
 */
export function Popup({ version }: { version: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Open the app, then close the popup; keep it open to show a failure.
   */
  async function handleOpen(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await openOrFocusApp();
      window.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <main className="popup">
      <header className="popup__header">
        <QuireMark size={32} />
        <div>
          <h1 className="popup__title">Quire</h1>
          <p className="popup__subtitle">Markdown notes on your computer</p>
        </div>
      </header>
      <button
        type="button"
        className="q-button q-button--primary q-button--large popup__open"
        onClick={() => void handleOpen()}
        disabled={busy}
        autoFocus
      >
        Open Quire
      </button>
      {error && (
        <p className="popup__error" role="alert">
          Quire could not open: {error}
        </p>
      )}
      <p className="popup__version">Version {version}</p>
    </main>
  );
}
