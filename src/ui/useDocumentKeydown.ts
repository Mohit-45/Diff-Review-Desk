import { useEffect } from 'react';

/** The single document-level keydown listener; removed on unmount and re-bound when the handler changes. */
export function useDocumentKeydown(listener: (event: KeyboardEvent) => void): void {
  useEffect(() => {
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, [listener]);
}
