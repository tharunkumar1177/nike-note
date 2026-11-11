/**
 * The keyboard shortcut reference (see blueprints/settings.md), with key
 * labels for the user's operating system.
 */
import { Fragment, useId } from "react";

import { detectOs } from "../shared/platform";
import { keyLabels, SHORTCUT_GROUPS, type KeyCombo } from "../shared/shortcuts";
import { Modal } from "./PageActions";

/** This computer's operating system, for key labels. */
const OS = detectOs(navigator.userAgent);

/**
 * One key combination as separate keys.
 */
function Combo({ combo }: { combo: KeyCombo }) {
  return (
    <span className="shortcuts__combo">
      {keyLabels(combo, OS).map((label, index) => (
        <kbd key={index} className="shortcuts__key">
          {label}
        </kbd>
      ))}
    </span>
  );
}

/**
 * List every shortcut by group until the user closes the dialog.
 */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  return (
    <Modal labelledBy={titleId} className="shortcuts-dialog" onClose={onClose}>
      <h2 id={titleId} className="modal__title">
        Keyboard shortcuts
      </h2>
      <div className="shortcuts__groups">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="shortcuts__group" aria-label={group.title}>
            <h3 className="settings__heading">{group.title}</h3>
            <ul className="shortcuts__list">
              {group.shortcuts.map((shortcut) => (
                <li key={shortcut.action} className="shortcuts__item">
                  <span>{shortcut.action}</span>
                  <span className="shortcuts__keys">
                    {shortcut.keys.map((combo, index) => (
                      <Fragment key={combo.join(" ")}>
                        {index > 0 && <span className="shortcuts__or">or</span>}
                        <Combo combo={combo} />
                      </Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="modal__actions">
        <button type="button" className="q-button q-button--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
