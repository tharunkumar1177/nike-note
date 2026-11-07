/**
 * The AI dialog for the open page (see blueprints/ai-assist.md): AI setup
 * first when nothing is saved yet, then the action the user picked.
 */
import type { AiSettings } from "../../shared/ai";
import { AiSetupDialog } from "./AiSetupDialog";
import { AskDialog } from "./AskDialog";
import type { AiSettingsStore } from "./aiStore";
import { SummaryDialog } from "./SummaryDialog";
import { WriteDialog } from "./WriteDialog";

/** An AI action on a page; `write` inserts at source line `line`. */
export type AiAction = { kind: "summary" } | { kind: "ask" } | { kind: "write"; line: number };

/**
 * Show setup when `setup` is set or no settings are saved, otherwise the
 * dialog for `action` on page `title` at `pagePath` with body `source`.
 */
export function PageAiDialog({
  store,
  settings,
  setup,
  action,
  title,
  source,
  pagePath,
  onSetupDone,
  onInsert,
  onClose,
}: {
  store: AiSettingsStore;
  settings: AiSettings | null;
  setup: boolean;
  action: AiAction;
  title: string;
  source: string;
  pagePath: string;
  onSetupDone: () => void;
  onInsert: (line: number, markdown: string) => void;
  onClose: () => void;
}) {
  if (setup || !settings) {
    return (
      <AiSetupDialog store={store} settings={settings} onSaved={onSetupDone} onClose={onClose} />
    );
  }
  const page = { settings, title, source, pagePath, onClose };
  switch (action.kind) {
    case "summary":
      return <SummaryDialog {...page} />;
    case "ask":
      return <AskDialog {...page} />;
    case "write":
      return <WriteDialog {...page} onInsert={(markdown) => onInsert(action.line, markdown)} />;
  }
}
