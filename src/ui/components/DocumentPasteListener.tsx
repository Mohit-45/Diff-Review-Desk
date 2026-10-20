import { useEffect } from 'react';
import type { ParseError } from '../../core/types';
import { clipboardEmptyError, isBlank } from './intakeValidation';

function useDocumentListener(listener: (event: ClipboardEvent) => void): void {
  useEffect(() => {
    const preventWindowDrop = (event: globalThis.DragEvent) => {
      event.preventDefault();
    };
    document.addEventListener('paste', listener);
    window.addEventListener('dragover', preventWindowDrop);
    window.addEventListener('drop', preventWindowDrop);
    return () => {
      document.removeEventListener('paste', listener);
      window.removeEventListener('dragover', preventWindowDrop);
      window.removeEventListener('drop', preventWindowDrop);
    };
  }, [listener]);
}

/**
 * Kept as a component so the landing screen can opt into document paste
 * without making a load dialog intercept pastes intended for its textarea.
 */
export function DocumentPasteListener({
  disabled,
  onLoadText,
  onError,
}: {
  readonly disabled: boolean;
  readonly onLoadText: (text: string) => void;
  readonly onError: (error: ParseError) => void;
}) {
  const listener = (event: ClipboardEvent) => {
    if (disabled) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('textarea, input, button') !== null) {
      return;
    }
    const text = event.clipboardData?.getData('text/plain') ?? '';
    event.preventDefault();
    if (isBlank(text)) {
      onError(clipboardEmptyError());
      return;
    }
    onLoadText(text);
  };

  useDocumentListener(listener);
  return null;
}
