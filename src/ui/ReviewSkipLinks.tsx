import { useEffect } from 'react';
import { reviewMessages } from './messages/review-screen';
import { hideStaticSkipLink } from './skipLink';

type ReviewSkipLinksProps = {
  readonly onSkipToFiles: () => void;
  readonly onSkipToDiff: () => void;
};

/**
 * The review screen's first two Tab stops. They are buttons, not anchors: an anchor would write
 * a hash into the URL and the history. Each is hidden until it has focus, by the shared
 * `.skip-link` class.
 */
export function ReviewSkipLinks({ onSkipToFiles, onSkipToDiff }: ReviewSkipLinksProps) {
  useEffect(() => hideStaticSkipLink(), []);
  return (
    <>
      <button type="button" className="skip-link" onClick={onSkipToFiles}>
        {reviewMessages.skipToFiles}
      </button>
      <button type="button" className="skip-link" onClick={onSkipToDiff}>
        {reviewMessages.skipToDiff}
      </button>
    </>
  );
}
