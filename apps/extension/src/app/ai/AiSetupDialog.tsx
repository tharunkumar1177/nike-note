/**
 * AI setup (see blueprints/ai-assist.md): choose a provider, enter an API key,
 * check it by listing the models it can use, pick one, and save. Nothing is
 * sent to a provider until the user checks a key or runs an AI action.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  defaultModel,
  describeAiError,
  PROVIDER_IDS,
  type AiModel,
  type AiSettings,
  type ProviderId,
} from "../../shared/ai";
import { Modal } from "../PageActions";
import type { AiSettingsStore } from "./aiStore";
import { providerInfo } from "./providers";

/**
 * The setup dialog, open while mounted. `settings` are the saved ones, if any;
 * `onSaved` runs after a save, before the dialog closes.
 */
export function AiSetupDialog({
  store,
  settings,
  onSaved,
  onClose,
}: {
  store: AiSettingsStore;
  settings: AiSettings | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<ProviderId>(settings?.provider ?? "gemini");
  const [key, setKey] = useState(settings?.key ?? "");
  const [models, setModels] = useState<AiModel[]>(
    settings ? [{ id: settings.model, label: settings.model }] : [],
  );
  const [model, setModel] = useState(settings?.model ?? "");
  const [checked, setChecked] = useState(settings !== null);
  const [busy, setBusy] = useState<"checking" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef<AbortController | null>(null);
  const titleId = useId();
  const providerId = useId();
  const keyId = useId();
  const modelId = useId();
  const info = providerInfo(provider);

  useEffect(() => () => checking.current?.abort(), []);

  /** Forget a checked model list after the provider or key changes. */
  const reset = (): void => {
    checking.current?.abort();
    setChecked(false);
    setModels([]);
    setError(null);
    setBusy(null);
  };

  /** Load the provider's SDK and list the models the key can use. */
  const check = async (): Promise<void> => {
    checking.current?.abort();
    const controller = new AbortController();
    checking.current = controller;
    setBusy("checking");
    setError(null);
    try {
      const adapter = await info.load();
      const listed = await adapter.listModels(key.trim(), controller.signal);
      if (controller.signal.aborted) return;
      if (listed.length === 0) throw new Error("This key cannot use any text models.");
      setModels(listed);
      setModel(defaultModel(listed, settings?.model ?? null) ?? "");
      setChecked(true);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(describeAiError(caught));
    } finally {
      if (checking.current === controller) setBusy(null);
    }
  };

  /** Save the checked key and the chosen model, or check an unchecked key. */
  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy !== null) return;
    if (!checked) {
      if (key.trim() !== "") await check();
      return;
    }
    if (model === "") return;
    setBusy("saving");
    try {
      await store.save({ provider, model, key: key.trim() });
      onSaved();
    } catch (caught) {
      setError(describeAiError(caught));
      setBusy(null);
    }
  };

  /** Forget the saved key and close. */
  const remove = async (): Promise<void> => {
    await store.clear();
    onClose();
  };

  return (
    <Modal labelledBy={titleId} className="ai-setup" onClose={onClose}>
      <form className="ai-setup__form" onSubmit={(event) => void save(event)}>
        <h2 id={titleId} className="modal__title">
          Set up AI
        </h2>
        <p className="modal__text">
          AI actions use your own API key. Quire sends a page&apos;s text to the provider only
          when you run an AI action on it. The key is stored in this browser profile only and is
          never written to your notes folder.
        </p>
        <label className="ai-setup__field" htmlFor={providerId}>
          <span>Provider</span>
          <select
            id={providerId}
            className="modal__input"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as ProviderId);
              reset();
            }}
          >
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {providerInfo(id).label}
              </option>
            ))}
          </select>
        </label>
        <label className="ai-setup__field" htmlFor={keyId}>
          <span>API key</span>
          <input
            id={keyId}
            className="modal__input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => {
              setKey(event.target.value);
              reset();
            }}
          />
        </label>
        <p className="ai-setup__hint">
          <a href={info.keyUrl} target="_blank" rel="noreferrer">
            Get a {info.label} key
          </a>
        </p>
        {checked && (
          <label className="ai-setup__field" htmlFor={modelId}>
            <span>Model</span>
            <select
              id={modelId}
              className="modal__input"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              {models.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label === option.id ? option.id : `${option.label} (${option.id})`}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p className="ai-setup__error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          {settings && (
            <button type="button" className="q-button ai-setup__remove" onClick={() => void remove()}>
              Remove key
            </button>
          )}
          <button type="button" className="q-button" onClick={onClose}>
            Cancel
          </button>
          {checked ? (
            <button
              type="submit"
              className="q-button q-button--primary"
              disabled={busy !== null || model === ""}
            >
              {busy === "saving" ? "Saving…" : "Save"}
            </button>
          ) : (
            <button
              type="button"
              className="q-button q-button--primary"
              disabled={busy !== null || key.trim() === ""}
              onClick={() => void check()}
            >
              {busy === "checking" ? "Checking…" : "Check key"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
