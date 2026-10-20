import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  adapterOver,
  newAreas,
  pasteAndLoad,
  renderApp,
  resetBrowserState,
  stubDialogs,
} from './journeyHelpers';
import { FAKE, RAW_SECRETS, secretsDiff } from '../diffFixtures';

beforeAll(stubDialogs);

afterEach(() => {
  cleanup();
  resetBrowserState();
});

const RLO = String.fromCodePoint(0x202e);

function allAttributes(): string {
  return [document.documentElement, ...document.querySelectorAll('*')]
    .flatMap((element) => Array.from(element.attributes).map((attribute) => attribute.value))
    .join('\n');
}

function cardFor(path: string): HTMLElement {
  const card = screen
    .getAllByRole('article')
    .find((article) => article.querySelector('h2')?.textContent === path);
  if (card === undefined) throw new Error(`No card for ${path}.`);
  return card;
}

function storedText(): string {
  return [window.localStorage, window.sessionStorage]
    .flatMap((area) =>
      Array.from({ length: area.length }, (_unused, index) => {
        const key = area.key(index) ?? '';
        return `${key}=${area.getItem(key) ?? ''}`;
      }),
    )
    .join('\n');
}

function load(): void {
  renderApp(adapterOver(newAreas()));
  pasteAndLoad(secretsDiff());
}

describe('SEC-MASK-E2E masking from paste to screen', () => {
  it('SEC-MASK-BEFORE keeps every raw secret out of the DOM, data-* and aria-* until Reveal', () => {
    load();

    expect(screen.getAllByRole('article')).toHaveLength(5);
    for (const raw of RAW_SECRETS) {
      expect(document.body.innerHTML, raw).not.toContain(raw);
      expect(allAttributes(), raw).not.toContain(raw);
      expect(document.body.textContent, raw).not.toContain(raw);
    }
    expect(document.body.innerHTML).not.toContain(RLO);
    const config = cardFor('src/config.ts');
    expect(config.textContent).toContain('AKIA****[24]');
    expect(
      within(config).getByRole('img', { name: 'U+202E right-to-left override' }).textContent,
    ).toBe('[U+202E]');
    expect(cardFor('.env').textContent).toContain('[REDACTED:sensitive-file-added]');
    expect(cardFor('old/.env').textContent).toContain('[REDACTED:sensitive-file-added]');
    expect(cardFor('certs/deploy.txt').textContent).toContain('[REDACTED:secret-known-token]');
    expect(cardFor('certs/deploy.txt').textContent).toContain('after the key');
  });

  it('SEC-REVEAL reveals one hunk at a time, only on cards that have something masked', () => {
    load();

    expect(
      within(cardFor('docs/readme.txt')).queryByRole('button', { name: /secrets$/ }),
    ).toBeNull();
    const config = cardFor('src/config.ts');
    fireEvent.click(within(config).getByRole('button', { name: 'Reveal secrets' }));

    expect(config.textContent).toContain(FAKE.awsKey);
    expect(config.textContent).toContain(FAKE.assignValue);
    expect(
      within(config).getByRole('button', { name: 'Hide secrets' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(within(config).getByRole('img', { name: 'U+202E right-to-left override' })).toBeTruthy();
    expect(cardFor('.env').textContent).not.toContain(FAKE.envValue);
    expect(cardFor('certs/deploy.txt').textContent).not.toContain(FAKE.pemBodyOne);
    for (const path of ['.env', 'old/.env', 'certs/deploy.txt']) {
      fireEvent.click(within(cardFor(path)).getByRole('button', { name: 'Reveal secrets' }));
    }
    expect(cardFor('.env').textContent).toContain(`DB_PASSWORD=${FAKE.envValue}`);
    expect(cardFor('old/.env').textContent).toContain(FAKE.deletedEnvValue);
    expect(cardFor('certs/deploy.txt').textContent).toContain(FAKE.pemBodyOne);
    expect(cardFor('certs/deploy.txt').textContent).toContain(FAKE.pemBodyTwo);

    fireEvent.click(within(config).getByRole('button', { name: 'Hide secrets' }));
    expect(config.textContent).not.toContain(FAKE.awsKey);
  });

  it('SEC-REVEAL-MEMORY keeps a revealed hunk revealed while the screen lives, and never saves it', () => {
    load();
    fireEvent.click(
      within(cardFor('src/config.ts')).getByRole('button', { name: 'Reveal secrets' }),
    );
    fireEvent.click(within(cardFor('src/config.ts')).getByRole('button', { name: 'Approve' }));

    expect(cardFor('src/config.ts').textContent).toContain(FAKE.awsKey);
    expect(storedText()).not.toContain(FAKE.awsKey);
    expect(storedText()).not.toContain(FAKE.assignValue);
  });

  it('SEC-REVEAL-RESET shows everything masked again on a fresh mount of the same diff', () => {
    const first = renderApp(adapterOver(newAreas()));
    pasteAndLoad(secretsDiff());
    fireEvent.click(within(cardFor('.env')).getByRole('button', { name: 'Reveal secrets' }));
    expect(cardFor('.env').textContent).toContain(FAKE.envValue);
    first.unmount();

    renderApp(adapterOver(newAreas()));
    pasteAndLoad(secretsDiff());

    expect(cardFor('.env').textContent).not.toContain(FAKE.envValue);
    expect(
      within(cardFor('.env'))
        .getByRole('button', { name: 'Reveal secrets' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('SEC-EXPORT-REDACTED exports redacted text even while a hunk is revealed', () => {
    load();
    for (const path of ['src/config.ts', '.env', 'certs/deploy.txt']) {
      fireEvent.click(within(cardFor(path)).getByRole('button', { name: 'Reveal secrets' }));
    }
    for (const path of ['src/config.ts', '.env', 'certs/deploy.txt']) {
      fireEvent.click(within(cardFor(path)).getByRole('button', { name: 'Reject' }));
    }
    fireEvent.click(screen.getAllByRole('button', { name: /^Export/ })[0] as HTMLElement);

    const preview = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Export preview' });
    for (const raw of RAW_SECRETS) {
      expect(preview.value, raw).not.toContain(raw);
    }
    expect(preview.value).toContain('[REDACTED:');
  });
});
