export const REVIEW_KEY_PREFIX = 'drd:review:';
export const DIFF_KEY_PREFIX = 'drd:diff:';
export const PREFS_KEY = 'drd:prefs';
export const THEME_KEY = 'drd:theme';
/** sessionStorage: which review this tab has open, so a reload can find it again. */
export const OPEN_KEY = 'drd:open';
/** Every key this app owns starts with this, which is how clearAll leaves foreign keys alone. */
export const APP_KEY_PREFIX = 'drd:';

export function reviewKeyFor(fingerprint: string): string {
  return `${REVIEW_KEY_PREFIX}${fingerprint}`;
}

export function diffKeyFor(fingerprint: string): string {
  return `${DIFF_KEY_PREFIX}${fingerprint}`;
}
