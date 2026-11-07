/**
 * Page summary (see blueprints/ai-assist.md): streams a short bullet summary
 * of the open page from the chosen model and renders it as Markdown, with
 * Stop, Try again, and Copy.
 */
import { listNumbers, parseDocument } from "@quire/markdown";
import { useEffect, useId, useState, useSyncExternalStore } from "react";

import { summaryPrompt, type AiSettings } from "../../shared/ai";
import { BlockView } from "../blocks/BlockView";
import { Modal } from "../PageActions";
import { AiRun } from "./aiStore";
import { providerInfo } from "./providers";

/** No sub-page titles: summary links are shown as written. */
const NO_TITLES: ReadonlyMap<string, string> = new Map();

/**
 * The summary dialog for page `title` at `pagePath` with body `source`,
 * generating as soon as it opens.
 */
export function SummaryDialog({
  settings,
  title,
  source,
  pagePath,
  onClose,
}: {
  settings: AiSettings;
  title: string;
  source: string;
  pagePath: string;
  onClose: () => void;
}) {
  const [run] = useState(() => new AiRun(settings, summaryPrompt(title, source)));
  const view = useSyncExternalStore(run.subscribe, run.getSnapshot);
  const [copied, setCopied] = useState(false);
  const titleId = useId();
  const blocks = parseDocument(view.text).blocks;
  const numbers = listNumbers(blocks);
  const running = view.state === "running";

  useEffect(() => {
    run.start();
    return () => run.stop();
  }, [run]);

  /** Copy the summary's Markdown. */
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(view.text.trim());
    setCopied(true);
  };

  return (
    <Modal labelledBy={titleId} className="ai-summary" onClose={onClose}>
      <h2 id={titleId} className="modal__title">
        Summary of “{title}”
      </h2>
      <div className="ai-summary__text" aria-live="polite" aria-busy={running}>
        {blocks.map((block, index) => (
          <BlockView
            key={block.line}
            block={block}
            number={numbers.get(index)}
            pagePath={pagePath}
            childTitles={NO_TITLES}
            onToggle={null}
          />
        ))}
        {running && view.text === "" && <p className="ai-summary__waiting">Summarizing…</p>}
      </div>
      {view.error && (
        <p className="ai-summary__error" role="alert">
          {view.error}
        </p>
      )}
      <p className="ai-summary__note">
        Written by {providerInfo(settings.provider).label} ({settings.model}) from this page.
        AI can make mistakes.
      </p>
      <div className="modal__actions">
        {running ? (
          <button type="button" className="q-button" onClick={() => run.stop()}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="q-button"
            onClick={() => {
              setCopied(false);
              run.start();
            }}
          >
            Try again
          </button>
        )}
        <button
          type="button"
          className="q-button"
          disabled={running || view.text.trim() === ""}
          onClick={() => void copy()}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" className="q-button q-button--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
