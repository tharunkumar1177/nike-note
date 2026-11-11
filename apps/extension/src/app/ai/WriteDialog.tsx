/**
 * Write with AI (see blueprints/ai-assist.md): the user describes what to
 * add, for example a vacation plan, previews the generated blocks, and
 * inserts them into the page where `/ai` was typed.
 */
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";

import { cleanGenerated, writePrompt, type AiSettings } from "../../shared/ai";
import { Modal } from "../PageActions";
import { AiOutput } from "./AiOutput";
import { AiRun, useAiRun } from "./aiStore";

/**
 * The write dialog for page `title` at `pagePath` with body `source`.
 * `onInsert` receives the cleaned Markdown to add.
 */
export function WriteDialog({
  settings,
  title,
  source,
  pagePath,
  onInsert,
  onClose,
}: {
  settings: AiSettings;
  title: string;
  source: string;
  pagePath: string;
  onInsert: (markdown: string) => void;
  onClose: () => void;
}) {
  const [request, setRequest] = useState("");
  const [run, setRun] = useState<AiRun | null>(null);
  const view = useAiRun(run);
  const titleId = useId();
  const running = view?.state === "running";
  const result = view && !running ? cleanGenerated(view.text) : "";

  /** Generate for the typed request, replacing any earlier draft. */
  const generate = (): void => {
    if (request.trim() === "" || running) return;
    const next = new AiRun(settings, writePrompt(request, title, source));
    setRun(next);
    next.start();
  };

  /** Generate on submit. */
  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    generate();
  };

  /** Enter generates; Shift+Enter starts a new line. */
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    generate();
  };

  return (
    <Modal labelledBy={titleId} className="ai-dialog" onClose={onClose}>
      <h2 id={titleId} className="modal__title">
        Write with AI
      </h2>
      <form className="ai-dialog__form ai-dialog__form--stacked" onSubmit={onSubmit}>
        <textarea
          className="modal__input ai-dialog__request"
          aria-label="What to write"
          placeholder="For example: a 5-day vacation plan for Kyoto with a packing list"
          rows={3}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="q-button"
          disabled={running || request.trim() === ""}
        >
          {view ? "Generate again" : "Generate"}
        </button>
      </form>
      {view && <AiOutput view={view} settings={settings} pagePath={pagePath} waiting="Writing…" />}
      <div className="modal__actions">
        {running && (
          <button type="button" className="q-button" onClick={() => run?.stop()}>
            Stop
          </button>
        )}
        <button type="button" className="q-button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="q-button q-button--primary"
          disabled={result === ""}
          onClick={() => onInsert(result)}
        >
          Insert
        </button>
      </div>
    </Modal>
  );
}
