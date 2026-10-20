import { useEffect, useId, useRef } from 'react';
import type { ParseError } from '../../core/types';
import { getBuiltInSample, type BuiltInSample } from '../../samples';
import { SafeText } from './SafeText';

export function ErrorPanel({
  error,
  onLoadSample,
  onRetry = null,
}: {
  readonly error: ParseError;
  readonly onLoadSample: (sample: BuiltInSample) => void;
  /** Given for a file that could not be read: it reads the same file again. */
  readonly onRetry?: (() => void) | null;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [error]);
  return (
    <section className="intake-error" aria-labelledby={headingId} tabIndex={-1}>
      <h3 id={headingId} ref={headingRef} tabIndex={-1}>
        <SafeText>{error.title}</SafeText>
      </h3>
      <p>
        <SafeText>{error.detail}</SafeText>
      </p>
      {error.suggestion !== null && (
        <textarea
          aria-label="Suggested fix command"
          readOnly
          rows={2}
          value={error.suggestion}
          spellCheck={false}
        />
      )}
      <div className="button-row">
        {onRetry === null ? null : (
          <button type="button" className="button button-primary" onClick={onRetry}>
            Retry
          </button>
        )}
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            onLoadSample(getBuiltInSample('agent-run-1'));
          }}
        >
          Load sample
        </button>
      </div>
    </section>
  );
}
