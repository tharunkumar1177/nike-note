/**
 * A Copy button for generated Markdown that says when it has copied.
 */
import { useState } from "react";

/**
 * Copy `text` (trimmed) to the clipboard; disabled while `text` is blank.
 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const value = text.trim();
  return (
    <button
      type="button"
      className="q-button"
      disabled={value === ""}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(value));
      }}
    >
      {copied === value && value !== "" ? "Copied" : "Copy"}
    </button>
  );
}
