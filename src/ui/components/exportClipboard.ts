// Narrow views of browser APIs that are missing or deprecated in some
// environments. `document.execCommand` is deprecated but is still the only
// copy path on pages without the async Clipboard API, and `navigator.clipboard`
// is undefined outside secure contexts even though the DOM types say otherwise.
type LegacyCopyDocument = {
  readonly execCommand?: (commandId: string) => boolean;
};

type ClipboardNavigator = {
  readonly clipboard?: {
    readonly writeText?: (text: string) => Promise<void>;
  };
};

function fallbackCopy(textarea: HTMLTextAreaElement): boolean {
  const legacyDocument: LegacyCopyDocument = document;
  if (typeof legacyDocument.execCommand !== 'function') {
    return false;
  }
  textarea.focus();
  textarea.select();
  try {
    return legacyDocument.execCommand('copy');
  } catch {
    return false;
  }
}

async function writeToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const clipboardNavigator: ClipboardNavigator = navigator;
  const clipboard = clipboardNavigator.clipboard;
  if (clipboard?.writeText === undefined) {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    // Permission or focus errors are expected; the caller tries the selection fallback.
    return false;
  }
}

/**
 * SPEC section 9 "Copy": the async Clipboard API first, then a hidden textarea
 * selected and copied with execCommand. Resolves false when neither worked, so
 * the caller can select the visible preview for a manual copy.
 */
export async function copyText(
  text: string,
  fallbackTextarea: HTMLTextAreaElement | null,
): Promise<boolean> {
  if (await writeToClipboard(text)) {
    return true;
  }
  return fallbackTextarea !== null && fallbackCopy(fallbackTextarea);
}

/**
 * Starts a download through a detached anchor and a Blob URL. Returns false
 * when the environment has no Blob URL support, so the caller can say so.
 */
export function downloadText(text: string, filename: string): boolean {
  if (
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);
  return true;
}
