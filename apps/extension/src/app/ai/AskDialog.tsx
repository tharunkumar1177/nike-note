/**
 * Ask about a page (see blueprints/ai-assist.md): the user asks a question,
 * and the chosen model answers from the open page's text only.
 */
import { useId, useState, type FormEvent } from "react";

import { askPrompt, type AiSettings } from "../../shared/ai";
import { Modal } from "../PageActions";
import { AiOutput } from "./AiOutput";
import { AiRun, useAiRun } from "./aiStore";
import { CopyButton } from "./CopyButton";

/**
 * The ask dialog for page `title` at `pagePath` with body `source`.
 */
export function AskDialog({
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
  const [question, setQuestion] = useState("");
  const [run, setRun] = useState<AiRun | null>(null);
  const view = useAiRun(run);
  const titleId = useId();
  const running = view?.state === "running";

  /** Ask the typed question, replacing any earlier answer. */
  const ask = (event: FormEvent): void => {
    event.preventDefault();
    if (question.trim() === "" || running) return;
    const next = new AiRun(settings, askPrompt(question, title, source));
    setRun(next);
    next.start();
  };

  return (
    <Modal labelledBy={titleId} className="ai-dialog" onClose={onClose}>
      <h2 id={titleId} className="modal__title">
        Ask about “{title}”
      </h2>
      <form className="ai-dialog__form" onSubmit={ask}>
        <input
          className="modal__input"
          aria-label="Question"
          placeholder="What do you want to know about this page?"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button
          type="submit"
          className="q-button q-button--primary"
          disabled={running || question.trim() === ""}
        >
          Ask
        </button>
      </form>
      {view && <AiOutput view={view} settings={settings} pagePath={pagePath} waiting="Thinking…" />}
      <div className="modal__actions">
        {running && (
          <button type="button" className="q-button" onClick={() => run?.stop()}>
            Stop
          </button>
        )}
        <CopyButton text={running ? "" : (view?.text ?? "")} />
        <button type="button" className="q-button" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
