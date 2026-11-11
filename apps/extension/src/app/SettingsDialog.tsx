/**
 * Settings dialog (see blueprints/settings.md): theme, page font, and full
 * width, applied as they are chosen, plus the way to the shortcut reference.
 */
import { useId, useSyncExternalStore } from "react";

import {
  PAGE_FONTS,
  THEMES,
  type AppearanceStore,
  type PageFont,
  type Theme,
} from "../shared/appearance";
import { detectOs } from "../shared/platform";
import { keyLabels } from "../shared/shortcuts";
import { Modal } from "./PageActions";

/** Labels of the themes. */
const THEME_LABELS: Readonly<Record<Theme, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** Labels of the page fonts. */
const FONT_LABELS: Readonly<Record<PageFont, string>> = {
  default: "Default",
  serif: "Serif",
  mono: "Mono",
};

/** This computer's operating system, for key labels. */
const OS = detectOs(navigator.userAgent);

/** The shortcut-reference key's label on this computer, such as `Ctrl+/`. */
const SHORTCUTS_KEYS = keyLabels(["Mod", "/"], OS).join(OS === "macos" ? "" : "+");

/**
 * Show and change the appearance settings in `store`.
 */
export function SettingsDialog({
  store,
  onShowShortcuts,
  onClose,
}: {
  store: AppearanceStore;
  onShowShortcuts: () => void;
  onClose: () => void;
}) {
  const appearance = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const titleId = useId();
  const widthHintId = useId();
  return (
    <Modal labelledBy={titleId} className="settings-dialog" onClose={onClose}>
      <h2 id={titleId} className="modal__title">
        Settings
      </h2>
      <div className="settings__sections">
        <section className="settings__section" aria-label="Appearance">
          <h3 className="settings__heading">Appearance</h3>
          <fieldset className="settings__field">
            <legend className="settings__label">Theme</legend>
            <div className="segmented">
              {THEMES.map((theme) => (
                <label key={theme} className="segmented__option">
                  <input
                    type="radio"
                    name="theme"
                    value={theme}
                    checked={appearance.theme === theme}
                    onChange={() => store.update({ theme })}
                  />
                  <span>{THEME_LABELS[theme]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="settings__field">
            <legend className="settings__label">Page font</legend>
            <div className="font-options">
              {PAGE_FONTS.map((font) => (
                <label key={font} className={`font-option font-option--${font}`}>
                  <input
                    type="radio"
                    name="font"
                    value={font}
                    checked={appearance.font === font}
                    onChange={() => store.update({ font })}
                  />
                  <span className="font-option__sample" aria-hidden="true">
                    Ag
                  </span>
                  <span className="font-option__name">{FONT_LABELS[font]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="settings__switch-row">
            <span className="settings__switch-text">
              <span className="settings__label">Full width</span>
              <span id={widthHintId} className="settings__hint">
                Use the whole window width for page text.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              aria-describedby={widthHintId}
              checked={appearance.fullWidth}
              onChange={(event) => store.update({ fullWidth: event.target.checked })}
            />
          </label>
        </section>
        <section className="settings__section" aria-label="Keyboard shortcuts">
          <h3 className="settings__heading">Keyboard shortcuts</h3>
          <div className="settings__switch-row">
            <span className="settings__hint">
              Every shortcut, also shown with <kbd className="shortcuts__key">{SHORTCUTS_KEYS}</kbd>
            </span>
            <button type="button" className="q-button" onClick={onShowShortcuts}>
              Show shortcuts
            </button>
          </div>
        </section>
      </div>
      <div className="modal__actions">
        <button type="button" className="q-button q-button--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
