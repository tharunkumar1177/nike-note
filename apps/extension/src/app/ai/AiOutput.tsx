/**
 * Generated text shown as read-only page blocks while it streams in, with
 * the provider's error and a note on who wrote it (see blueprints/ai-assist.md).
 */
import { listNumbers, parseDocument } from "@quire/markdown";

import type { AiSettings } from "../../shared/ai";
import { BlockView } from "../blocks/BlockView";
import type { AiRunView } from "./aiStore";
import { providerInfo } from "./providers";

/** No sub-page titles: links in generated text are shown as written. */
const NO_TITLES: ReadonlyMap<string, string> = new Map();

/**
 * Render `view`'s text for page `pagePath`, saying `waiting` until the first
 * words arrive.
 */
export function AiOutput({
  view,
  settings,
  pagePath,
  waiting,
}: {
  view: AiRunView;
  settings: AiSettings;
  pagePath: string;
  waiting: string;
}) {
  const blocks = parseDocument(view.text).blocks;
  const numbers = listNumbers(blocks);
  const running = view.state === "running";
  return (
    <>
      <div className="ai-output" aria-live="polite" aria-busy={running}>
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
        {running && view.text === "" && <p className="ai-output__waiting">{waiting}</p>}
      </div>
      {view.error && (
        <p className="ai-output__error" role="alert">
          {view.error}
        </p>
      )}
      <p className="ai-output__note">
        Written by {providerInfo(settings.provider).label} ({settings.model}) from this page. AI
        can make mistakes.
      </p>
    </>
  );
}
