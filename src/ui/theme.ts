import type { Prefs } from '../core/types';

/** "System" leaves the attribute off so the stylesheet follows prefers-color-scheme. */
export function applyTheme(theme: Prefs['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
    return;
  }
  root.setAttribute('data-theme', theme);
}
