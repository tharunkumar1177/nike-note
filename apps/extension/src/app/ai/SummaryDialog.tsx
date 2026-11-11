/**
 * Page summary (see blueprints/ai-assist.md): streams a short bullet summary
 * of the open page from the chosen model and renders it as Markdown, with
 * Stop, Try again, and Copy.
 */
import { useEffect, useId, useState } from "react";

import { summaryPrompt, type AiSettings } from "../../shared/ai";
import { Modal } from "../PageActions";
import { AiOutput } from "./AiOutput";
import { AiRun, useAiRun } from "./aiStore";
import { CopyButton } from "./CopyButton";

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
  const view = useAiRun(run);
  const titleId = useId();
  const running = view?.state === "running";

  useEffect(() => {
    run.start();
    return () => run.stop();
  }, [run]);

  return (
    <Modal labelledBy={titleId} className="ai-dialog" onClose={onClose}>
      <h2 id={titleId} className="modal__title">
        Summary of “{title}”
      </h2>
      {view && <AiOutput view={view} settings={settings} pagePath={pagePath} waiting="Summarizing…" />}
      <div className="modal__actions">
        {running ? (
          <button type="button" className="q-button" onClick={() => run.stop()}>
            Stop
          </button>
        ) : (
          <button type="button" className="q-button" onClick={() => run.start()}>
            Try again
          </button>
        )}
        <CopyButton text={running ? "" : (view?.text ?? "")} />
        <button type="button" className="q-button q-button--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
