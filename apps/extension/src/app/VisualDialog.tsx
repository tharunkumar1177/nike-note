/**
 * The Visual dialog opened by `/visual` (see blueprints/visual-blocks.md):
 * the user generates an interactive visual with AI, pastes HTML, or picks an
 * HTML file, previews it running in the sandbox, and inserts it. Insert
 * saves the HTML into the page's `assets` folder and adds the link line.
 */
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";

import { cleanVisualHtml, visualPrompt, type AiSettings } from "../shared/ai";
import { MAX_VISUAL_BYTES } from "../shared/visual";
import { AiSetupDialog } from "./ai/AiSetupDialog";
import { AiRun, useAiRun, type AiSettingsStore } from "./ai/aiStore";
import { providerInfo } from "./ai/providers";
import { VisualFrame } from "./blocks/VisualBlock";
import { Modal } from "./PageActions";

/** Where the visual's HTML comes from. */
type Source = "ai" | "paste" | "file";

/** The source choices, in the order shown. */
const SOURCES: readonly { id: Source; label: string }[] = [
  { id: "ai", label: "Generate with AI" },
  { id: "paste", label: "Paste HTML" },
  { id: "file", label: "Upload file" },
];

/** Quiet time after typing before pasted HTML is previewed. */
const PREVIEW_DELAY_MS = 500;

/** The message of an error of any kind. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Why `html` cannot be inserted, or null when it can. */
function problemWith(html: string): string | null {
  if (new TextEncoder().encode(html).length > MAX_VISUAL_BYTES) {
    return "Visuals larger than 1 MiB cannot be added.";
  }
  return null;
}

/**
 * The Visual dialog for page `title` with body `source` at `pagePath`.
 * `settings` are the saved AI settings, if any. `onInsert` saves the visual
 * and adds it to the page, rejecting with a readable message on failure.
 */
export function VisualDialog({
  store,
  settings,
  title,
  source,
  onInsert,
  onClose,
}: {
  store: AiSettingsStore;
  settings: AiSettings | null;
  title: string;
  source: string;
  onInsert: (title: string, html: string) => Promise<void>;
  onClose: () => void;
}) {
  const [from, setFrom] = useState<Source>("ai");
  const [name, setName] = useState("");
  const [request, setRequest] = useState("");
  const [pasted, setPasted] = useState("");
  const [shownPaste, setShownPaste] = useState("");
  const [file, setFile] = useState<{ name: string; html: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [run, setRun] = useState<AiRun | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const view = useAiRun(run);
  const titleId = useId();
  const noteId = useId();
  const running = view?.state === "running";

  useEffect(() => {
    const timer = window.setTimeout(() => setShownPaste(pasted), PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pasted]);

  const generated = view?.state === "done" ? cleanVisualHtml(view.text) : "";
  const html = from === "ai" ? generated : from === "paste" ? pasted.trim() : (file?.html ?? "");
  const preview = from === "paste" ? shownPaste.trim() : html;
  const problem = html === "" ? null : problemWith(html);

  /** Generate a visual for the typed request, replacing any earlier one. */
  const generate = (): void => {
    if (!settings || request.trim() === "" || running) return;
    const next = new AiRun(settings, visualPrompt(request, title, source));
    setRun(next);
    next.start();
  };

  /** Generate on submit. */
  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    generate();
  };

  /** Enter generates; Shift+Enter starts a new line. */
  const onRequestKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    generate();
  };

  /** Read the chosen HTML file, and use its name as the title when none is typed. */
  const pickFile = (chosen: File | undefined): void => {
    setFile(null);
    setFileError(null);
    if (!chosen) return;
    if (!/\.html?$/i.test(chosen.name)) {
      setFileError(`"${chosen.name}" is not an HTML file.`);
      return;
    }
    if (chosen.size > MAX_VISUAL_BYTES) {
      setFileError("Visuals larger than 1 MiB cannot be added.");
      return;
    }
    chosen
      .text()
      .then((text) => {
        setFile({ name: chosen.name, html: text });
        setName((typed) => (typed.trim() === "" ? chosen.name.replace(/\.html?$/i, "") : typed));
      })
      .catch((error: unknown) => setFileError(`Quire couldn't read the file: ${messageOf(error)}`));
  };

  /** Save the visual and add it to the page. */
  const insert = (): void => {
    if (html === "" || problem !== null || saving) return;
    const shownTitle = name.trim() || (from === "ai" ? request.trim() : "") || "Visual";
    setSaving(true);
    setSaveError(null);
    onInsert(shownTitle, html).catch((error: unknown) => {
      setSaving(false);
      setSaveError(`Quire couldn't add the visual: ${messageOf(error)}`);
    });
  };

  if (settingUp) {
    return (
      <AiSetupDialog
        store={store}
        settings={settings}
        onSaved={() => setSettingUp(false)}
        onClose={() => setSettingUp(false)}
      />
    );
  }

  return (
    <Modal labelledBy={titleId} className="ai-dialog visual-dialog" onClose={onClose}>
      <h2 id={titleId} className="modal__title">
        Add a visual
      </h2>
      <input
        className="modal__input"
        aria-label="Title"
        placeholder="Title, for example: Git merge vs rebase"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <fieldset className="visual-dialog__sources">
        <legend className="visual-dialog__legend">Source</legend>
        <div className="segmented">
          {SOURCES.map((choice) => (
            <label key={choice.id} className="segmented__option">
              <input
                type="radio"
                name="visual-source"
                value={choice.id}
                checked={from === choice.id}
                onChange={() => setFrom(choice.id)}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {from === "ai" && !settings && (
        <div className="visual-dialog__setup">
          <p className="modal__text">Set up AI to generate visuals, or paste or upload HTML.</p>
          <button type="button" className="q-button" onClick={() => setSettingUp(true)}>
            Set up AI
          </button>
        </div>
      )}
      {from === "ai" && settings && (
        <form className="ai-dialog__form ai-dialog__form--stacked" onSubmit={onSubmit}>
          <textarea
            className="modal__input ai-dialog__request"
            aria-label="Concept to explain"
            placeholder="For example: Git merge vs rebase, with the commit graph before and after"
            rows={3}
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            onKeyDown={onRequestKey}
          />
          <button type="submit" className="q-button" disabled={running || request.trim() === ""}>
            {view ? "Generate again" : "Generate"}
          </button>
        </form>
      )}
      {from === "ai" && settings && view && (
        <>
          {running && (
            <p className="ai-output__waiting" role="status">
              Generating… {view.text.length.toLocaleString()} characters so far
            </p>
          )}
          {view.error && (
            <p className="ai-output__error" role="alert">
              {view.error}
            </p>
          )}
          {view.state === "done" && generated === "" && (
            <p className="ai-output__error" role="alert">
              The answer held no HTML. Try again or describe the visual differently.
            </p>
          )}
          <p className="ai-output__note">
            Made by {providerInfo(settings.provider).label} ({settings.model}) from this page. AI
            can make mistakes.
          </p>
        </>
      )}
      {from === "paste" && (
        <textarea
          className="modal__input visual-dialog__html"
          aria-label="HTML"
          placeholder="<!doctype html>…"
          rows={8}
          spellCheck={false}
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
        />
      )}
      {from === "file" && (
        <div className="visual-dialog__file">
          <input
            type="file"
            aria-label="HTML file"
            accept=".html,.htm,text/html"
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
          {fileError && (
            <p className="ai-output__error" role="alert">
              {fileError}
            </p>
          )}
        </div>
      )}

      {preview !== "" && (
        <section className="visual-dialog__preview" aria-label="Preview">
          <VisualFrame html={preview} title={`Preview: ${name.trim() || "Visual"}`} />
        </section>
      )}
      {problem && (
        <p className="ai-output__error" role="alert">
          {problem}
        </p>
      )}
      {saveError && (
        <p className="ai-output__error" role="alert">
          {saveError}
        </p>
      )}
      <p id={noteId} className="ai-output__note">
        Visuals run in a sandbox without network access, so they cannot load scripts, styles, or
        pictures from the web. The HTML is saved in this page&apos;s assets folder.
      </p>
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
          aria-describedby={noteId}
          disabled={html === "" || problem !== null || saving}
          onClick={insert}
        >
          {saving ? "Adding…" : "Insert"}
        </button>
      </div>
    </Modal>
  );
}
