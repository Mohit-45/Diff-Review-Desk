import { useState } from 'react';
import type { Prefs } from '../../core/types';
import { DIALOG_TITLE_IDS } from '../dialogIds';
import {
  BehaviorFieldset,
  ClearDataSection,
  PrivacyFieldset,
  ThemeFieldset,
} from './SettingsSections';

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
      <div className="dialog-content">
        <h2 id={DIALOG_TITLE_IDS.settings}>Settings</h2>
        <p>Settings are unavailable.</p>
      </div>
    );
  }
  const activePrefs = currentPrefs;

  function update(next: Prefs, notify?: () => void) {
    onPrefsChange?.(next);
    if (onChange !== onPrefsChange) {
      onChange?.(next);
    }
    notify?.();
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
    <div className="dialog-content">
      <div className="dialog-header">
        <div>
          <h2 id={DIALOG_TITLE_IDS.settings}>Settings</h2>
          <p>Control appearance, keyboard behavior and local diff retention.</p>
        </div>
        {onClose !== undefined ? (
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>

      <ThemeFieldset
        theme={activePrefs.theme}
        onChoose={(theme) => {
          update({ ...activePrefs, theme }, () => onThemeChange?.(theme));
        }}
      />
      <BehaviorFieldset
        shortcutsEnabled={activePrefs.shortcutsEnabled}
        autoAdvance={activePrefs.autoAdvance}
        onShortcutsEnabledChange={(enabled) => {
          update({ ...activePrefs, shortcutsEnabled: enabled }, () =>
            onShortcutsEnabledChange?.(enabled),
          );
        }}
        onAutoAdvanceChange={(enabled) => {
          update({ ...activePrefs, autoAdvance: enabled }, () => onAutoAdvanceChange?.(enabled));
        }}
      />
      <PrivacyFieldset
        rememberDiff={activePrefs.rememberDiff}
        onRememberDiffChange={(rememberDiff) => {
          update({ ...activePrefs, rememberDiff }, () => onRememberDiffChange?.(rememberDiff));
        }}
      />
      <ClearDataSection
        confirming={confirmingClear}
        canClear={
          onClearData !== undefined || onClearSavedData !== undefined || onClear !== undefined
        }
        onRequestClear={() => {
          setConfirmingClear(true);
        }}
        onConfirmClear={() => void clearData()}
        onCancelClear={() => {
          setConfirmingClear(false);
        }}
      />
    </div>
  );
}
