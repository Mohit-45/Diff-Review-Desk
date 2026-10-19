import { useState } from 'react';
import type { Prefs } from '../../core/types';

export type SettingsDialogProps = {
  readonly prefs?: Prefs;
  readonly value?: Prefs;
  readonly open?: boolean;
  readonly onPrefsChange?: (prefs: Prefs) => void;
  /** Alias for callers that use a generic controlled-form callback. */
  readonly onChange?: (prefs: Prefs) => void;
  readonly onThemeChange?: (theme: Prefs['theme']) => void;
  readonly onShortcutsEnabledChange?: (enabled: boolean) => void;
  readonly onAutoAdvanceChange?: (enabled: boolean) => void;
  readonly onRememberDiffChange?: (remember: boolean) => void;
  readonly onClearData?: () => void | Promise<void>;
  readonly onClearSavedData?: () => void | Promise<void>;
  readonly onClear?: () => void | Promise<void>;
  readonly onClose?: () => void;
};

/** Settings content. The parent owns dialog lifecycle and persistence. */
export function SettingsDialog({
  prefs,
  value,
  onPrefsChange,
  onChange,
  onThemeChange,
  onShortcutsEnabledChange,
  onAutoAdvanceChange,
  onRememberDiffChange,
  onClearData,
  onClearSavedData,
  onClear,
  onClose,
}: SettingsDialogProps) {
  const currentPrefs = prefs ?? value;
  const [confirmingClear, setConfirmingClear] = useState(false);

  if (currentPrefs === undefined) {
    return (
      <section className="dialog-content" aria-labelledby="settings-dialog-title">
        <h2 id="settings-dialog-title">Settings</h2>
        <p>Settings are unavailable.</p>
      </section>
    );
  }
  const activePrefs = currentPrefs;

  function update(next: Prefs, field: (() => void) | undefined = undefined) {
    onPrefsChange?.(next);
    if (onChange !== onPrefsChange) {
      onChange?.(next);
    }
    field?.();
  }

  function chooseTheme(theme: Prefs['theme']) {
    update({ ...activePrefs, theme }, () => onThemeChange?.(theme));
  }

  function chooseShortcutsEnabled(enabled: boolean) {
    update({ ...activePrefs, shortcutsEnabled: enabled }, () =>
      onShortcutsEnabledChange?.(enabled),
    );
  }

  function chooseAutoAdvance(enabled: boolean) {
    update({ ...activePrefs, autoAdvance: enabled }, () => onAutoAdvanceChange?.(enabled));
  }

  function chooseRememberDiff(rememberDiff: boolean) {
    update({ ...activePrefs, rememberDiff }, () => onRememberDiffChange?.(rememberDiff));
  }

  async function clearData() {
    try {
      await (onClearData ?? onClearSavedData ?? onClear)?.();
      setConfirmingClear(false);
    } catch {
      // The storage owner reports expected failures; keep the confirmation open
      // so a failed clear cannot look successful.
    }
  }

  return (
    <section className="dialog-content" aria-labelledby="settings-dialog-title">
      <header className="dialog-header">
        <div>
          <h2 id="settings-dialog-title">Settings</h2>
          <p>Control appearance, keyboard behavior and local diff retention.</p>
        </div>
        {onClose !== undefined ? (
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close
          </button>
        ) : null}
      </header>

      <fieldset>
        <legend>Theme</legend>
        <label>
          <input
            type="radio"
            name="settings-theme"
            value="system"
            checked={currentPrefs.theme === 'system'}
            onChange={() => {
              chooseTheme('system');
            }}
          />
          System
        </label>
        <label>
          <input
            type="radio"
            name="settings-theme"
            value="light"
            checked={currentPrefs.theme === 'light'}
            onChange={() => {
              chooseTheme('light');
            }}
          />
          Light
        </label>
        <label>
          <input
            type="radio"
            name="settings-theme"
            value="dark"
            checked={currentPrefs.theme === 'dark'}
            onChange={() => {
              chooseTheme('dark');
            }}
          />
          Dark
        </label>
      </fieldset>

      <fieldset>
        <legend>Review behavior</legend>
        <label>
          <input
            type="checkbox"
            checked={currentPrefs.shortcutsEnabled}
            onChange={(event) => {
              chooseShortcutsEnabled(event.currentTarget.checked);
            }}
          />
          Single-key shortcuts
        </label>
        <p>When off, use the visible buttons instead of single letters.</p>
        <label>
          <input
            type="checkbox"
            checked={currentPrefs.autoAdvance}
            onChange={(event) => {
              chooseAutoAdvance(event.currentTarget.checked);
            }}
          />
          Advance after each decision
        </label>
      </fieldset>

      <fieldset>
        <legend>Privacy</legend>
        <label>
          <input
            type="checkbox"
            checked={currentPrefs.rememberDiff}
            onChange={(event) => {
              chooseRememberDiff(event.currentTarget.checked);
            }}
          />
          Remember diff text in this browser
        </label>
        <p>Review decisions are saved locally. Diff text is not retained unless this is enabled.</p>
      </fieldset>

      <section aria-labelledby="clear-data-title">
        <h3 id="clear-data-title">Saved data</h3>
        <p>Remove saved reviews, preferences and any remembered diff text from this browser.</p>
        {confirmingClear ? (
          <div role="alertdialog" aria-labelledby="clear-data-confirm-title">
            <h4 id="clear-data-confirm-title">Clear all saved data?</h4>
            <p>This cannot be undone.</p>
            <button type="button" className="button button-danger" onClick={() => void clearData()}>
              Clear all saved data
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setConfirmingClear(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button button-danger"
            onClick={() => {
              setConfirmingClear(true);
            }}
            disabled={
              onClearData === undefined && onClearSavedData === undefined && onClear === undefined
            }
          >
            Clear all saved data
          </button>
        )}
      </section>
    </section>
  );
}
