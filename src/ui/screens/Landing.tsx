import { useState } from 'react';
import type { ParseError } from '../../core/types';
import type { BuiltInSample } from '../../samples';
import { IntakeControls, type LoadFileCallback } from '../components/LoadDialog';

export type LandingProps = {
  readonly initialText?: string;
  readonly error?: ParseError | null;
  readonly status?: string;
  readonly loading?: boolean;
  readonly onLoadText: (text: string) => void;
  readonly onLoadFile: LoadFileCallback;
  readonly onLoadSample: (sample: BuiltInSample) => void;
  readonly onError?: (error: ParseError) => void;
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
}: LandingProps) {
  const [value, setValue] = useState(initialText);
  return (
    <>
      <header className="site-header">
        <h1>Diff Review Desk</h1>
        <p>Human review for AI-generated changes.</p>
      </header>
      <main id="main" className="landing-main" aria-busy={loading || undefined}>
        <section aria-labelledby="landing-title" className="landing-card">
          <h2 id="landing-title">Review what your AI agent changed, one hunk at a time</h2>
          <p className="lede">
            Paste or drop a unified diff to inspect changes, risk flags and precise feedback.
          </p>
          <IntakeControls
            value={value}
            onValueChange={setValue}
            onLoadText={onLoadText}
            onLoadFile={onLoadFile}
            onLoadSample={onLoadSample}
            onError={onError}
            error={error}
            status={status}
            loading={loading}
            idPrefix="diff"
            enableDocumentPaste
            showPrivacyLine
          />
        </section>
      </main>
    </>
  );
}
