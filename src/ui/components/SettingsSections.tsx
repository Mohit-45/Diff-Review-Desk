import { useEffect, useRef } from 'react';
import type { Prefs } from '../../core/types';

type ThemeOption = {
  readonly value: Prefs['theme'];
  readonly label: string;
};

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function ThemeFieldset({
  theme,
  onChoose,
}: {
  readonly theme: Prefs['theme'];
  readonly onChoose: (theme: Prefs['theme']) => void;
}) {
  return (
    <fieldset>
      <legend>Theme</legend>
      {THEME_OPTIONS.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name="settings-theme"
            value={option.value}
            checked={theme === option.value}
            onChange={() => {
              onChoose(option.value);
            }}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export function BehaviorFieldset({
  shortcutsEnabled,
  autoAdvance,
  onShortcutsEnabledChange,
  onAutoAdvanceChange,
}: {
  readonly shortcutsEnabled: boolean;
  readonly autoAdvance: boolean;
  readonly onShortcutsEnabledChange: (enabled: boolean) => void;
  readonly onAutoAdvanceChange: (enabled: boolean) => void;
}) {
  return (
    <fieldset>
      <legend>Review behavior</legend>
      <label>
        <input
          type="checkbox"
          checked={shortcutsEnabled}
          onChange={(event) => {
            onShortcutsEnabledChange(event.currentTarget.checked);
          }}
        />
        Single-key shortcuts
      </label>
      <p>When off, use the visible buttons instead of single letters.</p>
      <label>
        <input
          type="checkbox"
          checked={autoAdvance}
          onChange={(event) => {
            onAutoAdvanceChange(event.currentTarget.checked);
          }}
        />
        Advance after each decision
      </label>
    </fieldset>
  );
}

export function PrivacyFieldset({
  rememberDiff,
  onRememberDiffChange,
}: {
  readonly rememberDiff: boolean;
  readonly onRememberDiffChange: (remember: boolean) => void;
}) {
  return (
    <fieldset>
      <legend>Privacy</legend>
      <label>
        <input
          type="checkbox"
          checked={rememberDiff}
          onChange={(event) => {
            onRememberDiffChange(event.currentTarget.checked);
          }}
        />
        Remember diff text in this browser
      </label>
      <p>Review decisions are saved locally. Diff text is not retained unless this is enabled.</p>
    </fieldset>
  );
}

export function ClearDataSection({
  confirming,
  canClear,
  onRequestClear,
  onConfirmClear,
  onCancelClear,
}: {
  readonly confirming: boolean;
  readonly canClear: boolean;
  readonly onRequestClear: () => void;
  readonly onConfirmClear: () => void;
  readonly onCancelClear: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const wasConfirming = useRef(false);
  // A confirmation puts focus on the safe choice, so an Enter press cannot wipe anything. When
  // it goes away, the button that opened it comes back and takes the focus its own removal freed.
  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    } else if (wasConfirming.current) {
      (canClear ? requestRef : titleRef).current?.focus();
    }
    wasConfirming.current = confirming;
  }, [confirming, canClear]);
  return (
    <section aria-labelledby="clear-data-title">
      <h3 id="clear-data-title" ref={titleRef} tabIndex={-1}>
        Saved data
      </h3>
      <p>Remove saved reviews, preferences and any remembered diff text from this browser.</p>
      {confirming ? (
        <div role="alertdialog" aria-labelledby="clear-data-confirm-title">
          <h4 id="clear-data-confirm-title">Clear all saved data?</h4>
          <p>This cannot be undone.</p>
          <button type="button" className="button button-danger" onClick={onConfirmClear}>
            Clear all saved data
          </button>
          <button
            ref={cancelRef}
            type="button"
            className="button button-secondary"
            onClick={onCancelClear}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          ref={requestRef}
          type="button"
          className="button button-danger"
          onClick={onRequestClear}
          disabled={!canClear}
        >
          Clear all saved data
        </button>
      )}
    </section>
  );
}
