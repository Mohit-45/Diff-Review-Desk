import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageArea, createStorageAdapter } from '../storage/adapter';
import { ScriptedArea, always, securityError } from '../storage/areaFixtures';
import { StorageNotices } from './components/StorageNotices';
import { Landing } from './screens/Landing';
import { ReviewHeader } from './ReviewHeader';
import { readSnapshot, sameSnapshot } from './storageSnapshot';
import { applyTheme } from './theme';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

const BANNER = "Progress isn't being saved in this browser. Export your review to keep it.";

describe('readSnapshot', () => {
  it('reports a healthy adapter as not degraded with no notices', () => {
    const adapter = createStorageAdapter({
      local: new MemoryStorageArea(),
      session: new MemoryStorageArea(),
    });
    expect(readSnapshot(adapter)).toEqual({ degraded: false, notices: [] });
  });

  it('ST-DENIED reports degraded without repeating the banner wording as a notice', () => {
    const blocked = new ScriptedArea().failWhen(
      'get',
      always(() => securityError()),
    );
    const adapter = createStorageAdapter({ local: blocked, session: blocked });
    expect(readSnapshot(adapter)).toEqual({ degraded: true, notices: [] });
  });

  it('lists a corrupt-preferences notice once however often it is read', () => {
    const local = new ScriptedArea();
    local.seed('drd:prefs', '{');
    const adapter = createStorageAdapter({ local, session: new ScriptedArea() });
    adapter.getPrefs();
    adapter.getPrefs();
    expect(readSnapshot(adapter).notices).toEqual([
      'Saved preferences were corrupt and were reset.',
    ]);
  });

  it('compares snapshots by content', () => {
    expect(
      sameSnapshot({ degraded: false, notices: ['a'] }, { degraded: false, notices: ['a'] }),
    ).toBe(true);
    expect(
      sameSnapshot({ degraded: false, notices: ['a'] }, { degraded: true, notices: ['a'] }),
    ).toBe(false);
    expect(
      sameSnapshot({ degraded: false, notices: ['a'] }, { degraded: false, notices: ['b'] }),
    ).toBe(false);
    expect(
      sameSnapshot({ degraded: false, notices: [] }, { degraded: false, notices: ['a'] }),
    ).toBe(false);
  });
});

describe('StorageNotices', () => {
  it('renders nothing for a healthy snapshot', () => {
    const { container } = render(<StorageNotices snapshot={{ degraded: false, notices: [] }} />);
    expect(container.textContent).toBe('');
  });

  it('shows the banner once and each other message once, without an alert role', () => {
    render(
      <StorageNotices
        snapshot={{
          degraded: true,
          notices: ['Saved review data was corrupt and was not restored.'],
        }}
        notes={['Saved review data was corrupt and was not restored.', 'A note.']}
      />,
    );
    expect(screen.getAllByText(BANNER)).toHaveLength(1);
    expect(screen.getAllByText('Saved review data was corrupt and was not restored.')).toHaveLength(
      1,
    );
    expect(screen.getByText('A note.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Landing storage state', () => {
  it('shows the banner on the landing screen when storage is degraded', () => {
    render(
      <Landing
        storage={{ degraded: true, notices: [] }}
        onLoadText={vi.fn()}
        onLoadFile={vi.fn()}
        onLoadSample={vi.fn()}
      />,
    );
    expect(screen.getAllByText(BANNER)).toHaveLength(1);
  });

  it('focuses the main landmark only when asked', () => {
    const props = { onLoadText: vi.fn(), onLoadFile: vi.fn(), onLoadSample: vi.fn() };
    const { unmount } = render(<Landing {...props} />);
    expect(document.activeElement).toBe(document.body);
    unmount();
    render(<Landing {...props} focusMain />);
    expect(document.activeElement).toBe(document.getElementById('main'));
  });

  it('keeps the privacy line the spec asks for', () => {
    render(<Landing onLoadText={vi.fn()} onLoadFile={vi.fn()} onLoadSample={vi.fn()} />);
    expect(screen.getByText(/Decisions and comments are saved in this browser\./u)).toBeTruthy();
  });
});

describe('ReviewHeader save indicator', () => {
  it.each([
    ['saved', 'Saved', false],
    ['saving', 'Saving', false],
    ['not-saved', 'Not saved', true],
  ] as const)('shows %s as plain text, an alert only when not saved', (status, text, alert) => {
    render(
      <ReviewHeader
        label="A review"
        save={status}
        onCommand={vi.fn()}
        onSkipToFiles={vi.fn()}
        onSkipToDiff={vi.fn()}
      />,
    );
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole('alert') !== null).toBe(alert);
  });
});

describe('applyTheme', () => {
  it('sets light and dark and removes the attribute for system', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
