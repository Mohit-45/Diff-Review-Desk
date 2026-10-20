import { useEffect } from 'react';

/**
 * One beforeunload listener while there is something a reload would lose, and none otherwise.
 * The effect cleans up on every change, so a StrictMode remount cannot leave two behind.
 */
export function useBeforeUnloadGuard(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [active]);
}
