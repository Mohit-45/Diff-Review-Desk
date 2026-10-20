import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Prefs } from '../../core/types';
import { SettingsDialog } from './SettingsDialog';

afterEach(() => {
  cleanup();
});

const PREFS: Prefs = {
  theme: 'system',
  shortcutsEnabled: true,
  autoAdvance: true,
  rememberDiff: false,
};

describe('SettingsDialog preferences', () => {
  it('SETTINGS-STATE reflects the supplied preferences in every control', () => {
    render(<SettingsDialog prefs={{ ...PREFS, theme: 'light', autoAdvance: false }} />);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'System' }).checked).toBe(false);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Light' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Dark' }).checked).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Single-key shortcuts' }).checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Advance after each decision' })
        .checked,
    ).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Remember diff text in this browser' })
        .checked,
    ).toBe(false);
  });

  it('SETTINGS-GROUPS labels the theme, behaviour and privacy groups', () => {
    render(<SettingsDialog prefs={PREFS} />);
    expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Review behavior' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Privacy' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Saved data' })).toBeTruthy();
  });

  it('SETTINGS-CHANGE sends the full next preferences and the single-field callback', () => {
    const onPrefsChange = vi.fn<(prefs: Prefs) => void>();
    const onThemeChange = vi.fn<(theme: Prefs['theme']) => void>();
    const onShortcutsEnabledChange = vi.fn<(enabled: boolean) => void>();
    const onAutoAdvanceChange = vi.fn<(enabled: boolean) => void>();
    const onRememberDiffChange = vi.fn<(remember: boolean) => void>();
    render(
      <SettingsDialog
        prefs={PREFS}
        onPrefsChange={onPrefsChange}
        onThemeChange={onThemeChange}
        onShortcutsEnabledChange={onShortcutsEnabledChange}
        onAutoAdvanceChange={onAutoAdvanceChange}
        onRememberDiffChange={onRememberDiffChange}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(onPrefsChange).toHaveBeenLastCalledWith({ ...PREFS, theme: 'light' });
    expect(onThemeChange).toHaveBeenCalledWith('light');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Single-key shortcuts' }));
    expect(onPrefsChange).toHaveBeenLastCalledWith({ ...PREFS, shortcutsEnabled: false });
    expect(onShortcutsEnabledChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Advance after each decision' }));
    expect(onPrefsChange).toHaveBeenLastCalledWith({ ...PREFS, autoAdvance: false });
    expect(onAutoAdvanceChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember diff text in this browser' }));
    expect(onPrefsChange).toHaveBeenLastCalledWith({ ...PREFS, rememberDiff: true });
    expect(onRememberDiffChange).toHaveBeenCalledWith(true);

    expect(onPrefsChange).toHaveBeenCalledTimes(4);
  });

  it('SETTINGS-ALIAS notifies onChange as well, but only once when it is the same function', () => {
    const onPrefsChange = vi.fn<(prefs: Prefs) => void>();
    const onChange = vi.fn<(prefs: Prefs) => void>();
    const { rerender } = render(
      <SettingsDialog value={PREFS} onPrefsChange={onPrefsChange} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(onPrefsChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();

    const shared = vi.fn<(prefs: Prefs) => void>();
    rerender(<SettingsDialog value={PREFS} onPrefsChange={shared} onChange={shared} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(shared).toHaveBeenCalledOnce();
  });

  it('SETTINGS-ALIAS works with only onChange', () => {
    const onChange = vi.fn<(prefs: Prefs) => void>();
    render(<SettingsDialog prefs={PREFS} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledWith({ ...PREFS, theme: 'dark' });
  });

  it('SETTINGS-UNAVAILABLE says so when no preferences are supplied', () => {
    render(<SettingsDialog />);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByText('Settings are unavailable.')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('SETTINGS-CLOSE shows Close only when a handler is supplied', () => {
    const onClose = vi.fn();
    const { rerender } = render(<SettingsDialog prefs={PREFS} />);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

    rerender(<SettingsDialog prefs={PREFS} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('SettingsDialog clearing saved data', () => {
  it('SETTINGS-CLEAR-DISABLED disables the button when nothing can clear the data', () => {
    render(<SettingsDialog prefs={PREFS} />);
    expect(screen.getByRole('button', { name: 'Clear all saved data' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it.each(['onClearData', 'onClearSavedData', 'onClear'] as const)(
    'SETTINGS-CLEAR-ALIAS confirms before calling %s and then closes the confirmation',
    async (name) => {
      const clear = vi.fn<() => Promise<void>>(() => Promise.resolve());
      render(<SettingsDialog prefs={PREFS} {...{ [name]: clear }} />);

      fireEvent.click(screen.getByRole('button', { name: 'Clear all saved data' }));
      expect(screen.getByRole('alertdialog', { name: 'Clear all saved data?' })).toBeTruthy();
      expect(clear).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Clear all saved data' }));
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).toBeNull();
      });
      expect(clear).toHaveBeenCalledOnce();
    },
  );

  it('SETTINGS-CLEAR-CANCEL backs out of the confirmation without clearing', () => {
    const onClearData = vi.fn();
    render(<SettingsDialog prefs={PREFS} onClearData={onClearData} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear all saved data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClearData).not.toHaveBeenCalled();
  });

  it('SETTINGS-CLEAR-FAILED keeps the confirmation open so a failure cannot look like success', async () => {
    const onClearData = vi.fn<() => Promise<void>>(() => Promise.reject(new Error('quota')));
    render(<SettingsDialog prefs={PREFS} onClearData={onClearData} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear all saved data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all saved data' }));
    await waitFor(() => {
      expect(onClearData).toHaveBeenCalledOnce();
    });

    expect(screen.getByRole('alertdialog', { name: 'Clear all saved data?' })).toBeTruthy();
  });
});

describe('SettingsDialog clear confirmation focus', () => {
  it('SETTINGS-CLEAR-FOCUS moves focus to Cancel when the confirmation opens', () => {
    render(<SettingsDialog prefs={PREFS} onClearData={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all saved data' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });
});
