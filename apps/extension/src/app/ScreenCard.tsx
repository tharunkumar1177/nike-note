/**
 * Centered card layout shared by the connection and setup screens.
 */
import type { ReactNode } from "react";

import { QuireMark } from "../shared/QuireMark";

/**
 * Render a titled card with optional Retry action and technical details.
 */
export function ScreenCard({
  title,
  children,
  detail,
  onRetry,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  detail?: string;
  onRetry?: () => void;
  wide?: boolean;
}) {
  return (
    <main className="screen">
      <section
        className={wide ? "screen__card screen__card--wide" : "screen__card"}
        aria-labelledby="screen-title"
      >
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
 * Centered spinner with a short status line, shown after a brief delay.
 */
export function Waiting({ label }: { label: string }) {
  return (
    <main className="screen screen--connecting" aria-busy="true">
      <div className="connecting" role="status">
        <span className="connecting__spinner" aria-hidden="true" />
        {label}
      </div>
    </main>
  );
}
