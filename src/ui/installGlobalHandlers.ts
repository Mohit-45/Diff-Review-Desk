import { reportUnexpected, scriptLocation } from './reportUnexpected';

/**
 * Errors that no component catches: a script error and a promise nobody handled. Both are
 * reported without their messages and left to the browser's own handling afterwards.
 * Returns the function that removes both listeners.
 */
export function installGlobalHandlers(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    reportUnexpected('window-error', event.error, {
      location: scriptLocation(event.filename, event.lineno, event.colno),
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportUnexpected('unhandled-rejection', event.reason);
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
