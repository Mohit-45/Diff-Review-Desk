/** The link in index.html: a real anchor, so it also works before any script has run. */
const STATIC_SKIP_LINK = 'a.skip-link[href="#main"]';

/**
 * An anchor to #main writes a hash into the URL and a history entry, and the app keeps both
 * empty. One document-level handler (the page's CSP allows no inline script) cancels the jump
 * and moves focus to the main landmark itself.
 */
export function installStaticSkipLink(doc: Document = document): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(STATIC_SKIP_LINK) === null) {
      return;
    }
    event.preventDefault();
    doc.getElementById('main')?.focus();
  };
  doc.addEventListener('click', onClick);
  return () => {
    doc.removeEventListener('click', onClick);
  };
}

/**
 * The review screen has its own first stops, "Skip to changed files" and "Skip to diff", so
 * the generic link steps aside while it is on screen. Returns the undo.
 */
export function hideStaticSkipLink(doc: Document = document): () => void {
  const link = doc.querySelector<HTMLElement>(STATIC_SKIP_LINK);
  if (link === null) {
    return () => undefined;
  }
  link.hidden = true;
  return () => {
    link.hidden = false;
  };
}
