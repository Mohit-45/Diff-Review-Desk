import { afterEach, describe, expect, it } from 'vitest';
import { hideStaticSkipLink, installStaticSkipLink } from './skipLink';

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});

function pageWithSkipLink(): { link: HTMLAnchorElement; main: HTMLElement } {
  const link = document.createElement('a');
  link.className = 'skip-link';
  link.setAttribute('href', '#main');
  link.textContent = 'Skip to main content';
  const main = document.createElement('main');
  main.id = 'main';
  main.tabIndex = -1;
  document.body.append(link, main);
  return { link, main };
}

describe('UI-SKIP-STATIC the static Skip to main content link', () => {
  it('moves focus to main and leaves the URL and history alone', () => {
    const { link, main } = pageWithSkipLink();
    const remove = installStaticSkipLink();
    const entries = window.history.length;
    const notCancelled = link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(notCancelled).toBe(false);
    expect(document.activeElement).toBe(main);
    expect(window.location.hash).toBe('');
    expect(window.history.length).toBe(entries);
    remove();
  });

  it('also handles a click on something inside the link', () => {
    const { link, main } = pageWithSkipLink();
    const inner = document.createElement('span');
    link.append(inner);
    const remove = installStaticSkipLink();
    inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(main);
    remove();
  });

  it('ignores every other click', () => {
    const { main } = pageWithSkipLink();
    const other = document.createElement('button');
    document.body.append(other);
    const remove = installStaticSkipLink();
    const notCancelled = other.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(notCancelled).toBe(true);
    expect(document.activeElement).not.toBe(main);
    remove();
  });

  it('stops listening once removed', () => {
    const { link, main } = pageWithSkipLink();
    installStaticSkipLink()();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.activeElement).not.toBe(main);
  });

  it('copes with a page that has no main to move to', () => {
    const { link, main } = pageWithSkipLink();
    main.remove();
    const remove = installStaticSkipLink();
    expect(link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBe(
      false,
    );
    remove();
  });
});

describe('UI-SKIP-HIDE the generic link steps aside for the review screen', () => {
  it('hides the link and the undo shows it again', () => {
    const { link } = pageWithSkipLink();
    const undo = hideStaticSkipLink();
    expect(link.hidden).toBe(true);
    undo();
    expect(link.hidden).toBe(false);
  });

  it('does nothing on a page without the link', () => {
    expect(() => {
      hideStaticSkipLink()();
    }).not.toThrow();
  });
});
