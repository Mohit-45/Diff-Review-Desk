import { useEffect, useRef, useState } from 'react';
import type { PendingChoice, PendingLoad } from '../../app/loadPlan';
import type { ParseError } from '../../core/types';
import type { BuiltInSample } from '../../samples';
import { IntakeControls, type LoadFileCallback } from '../components/LoadDialog';
import { LoadDecision } from '../components/LoadDecision';
import { StorageNotices } from '../components/StorageNotices';
import type { StorageSnapshot } from '../storageSnapshot';

export type LandingProps = {
  readonly initialText?: string;
  readonly error?: ParseError | null;
  readonly status?: string;
  readonly loading?: boolean;
  readonly onLoadText: (text: string) => void;
  readonly onLoadFile: LoadFileCallback;
  readonly onLoadSample: (sample: BuiltInSample) => void;
  readonly onError?: (error: ParseError) => void;
  /** Present while the error on show is an unreadable file: reads that file again. */
  readonly onRetry?: (() => void) | null;
  readonly storage?: StorageSnapshot;
  /** Moves focus to the main landmark once, for a return to this screen the user asked for. */
  readonly focusMain?: boolean;
  /** A parsed diff that matches reviews saved earlier and waits for the user's answer. */
  readonly pending?: PendingLoad | null;
  readonly onResolvePending?: (choice: PendingChoice) => void;
  readonly onCancelPending?: () => void;
};

export function Landing({
  initialText = '',
  error,
  status,
  loading = false,
  onLoadText,
  onLoadFile,
  onLoadSample,
  onError,
  onRetry = null,
  storage,
  focusMain = false,
  pending = null,
  onResolvePending,
  onCancelPending,
}: LandingProps) {
  const [value, setValue] = useState(initialText);
  const mainRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    if (focusMain) {
      mainRef.current?.focus();
    }
  }, [focusMain]);
  // Going back from the question removes the button that held focus, so the title takes it.
  useEffect(() => {
    if (wasPending.current && pending === null) {
      titleRef.current?.focus();
    }
    wasPending.current = pending !== null;
  }, [pending]);
  return (
    <>
      <header className="site-header">
        <h1>Diff Review Desk</h1>
        <p>Human review for AI-generated changes.</p>
      </header>
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="landing-main"
        aria-busy={loading || undefined}
      >
        {storage === undefined ? null : <StorageNotices snapshot={storage} />}
        <section aria-labelledby="landing-title" className="landing-card">
          <h2 id="landing-title" ref={titleRef} tabIndex={-1}>
            Review what your AI agent changed, one hunk at a time
          </h2>
          <p className="lede">
            Paste or drop a unified diff to inspect changes, risk flags and precise feedback.
          </p>
          {pending !== null && onResolvePending !== undefined && onCancelPending !== undefined ? (
            <LoadDecision
              pending={pending}
              onResolve={onResolvePending}
              onCancel={onCancelPending}
            />
          ) : (
            <IntakeControls
              value={value}
              onValueChange={setValue}
              onLoadText={onLoadText}
              onLoadFile={onLoadFile}
              onLoadSample={onLoadSample}
              onError={onError}
              onRetry={onRetry}
              error={error}
              status={status}
              loading={loading}
              idPrefix="diff"
              enableDocumentPaste
              showPrivacyLine
            />
          )}
        </section>
      </main>
    </>
  );
}
