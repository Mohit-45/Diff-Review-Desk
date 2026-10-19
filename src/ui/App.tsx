import { useMemo, useReducer, useRef, useState } from 'react';
import { parseDiff } from '../core/parser/parse';
import { analyze } from '../core/risk/engine';
import { createReviewState, reviewReducer } from '../core/review/reducer';
import { DEFAULT_PREFS } from '../storage/validator';
import type { DiffFile, ParseError, Prefs, ReviewState } from '../core/types';
import { BUILT_IN_SAMPLES, type BuiltInSample } from '../samples';
import { ExportDialog } from './components/ExportDialog';
import { HelpDialog } from './components/HelpDialog';
import { HunkCard } from './components/HunkCard';
import { LoadDialog } from './components/LoadDialog';
import { ReviewRail } from './components/ReviewRail';
import { SettingsDialog } from './components/SettingsDialog';
import { Landing } from './screens/Landing';

type DialogName = 'load' | 'export' | 'help' | 'settings' | null;

function hunkEntries(files: readonly DiffFile[]) {
  return files.flatMap((file) => file.hunks.map((hunk) => ({ file, hunk })));
}

function parseLoaded(
  text: string,
): { readonly files: readonly DiffFile[]; readonly state: ReviewState } | ParseError {
  const parsed = parseDiff(text);
  if (!parsed.ok) return parsed.error;
  const entries = hunkEntries(parsed.files);
  return {
    files: parsed.files,
    state: createReviewState(
      parsed.fingerprint,
      entries.map(({ hunk }) => hunk.id),
      parsed.files[0]?.displayPath ?? 'Pasted diff',
    ),
  };
}

export function App() {
  const [model, setModel] = useState<{
    readonly files: readonly DiffFile[];
    readonly state: ReviewState;
  } | null>(null);
  const [reviewState, dispatch] = useReducer(reviewReducer, createReviewState('', []));
  const [error, setError] = useState<ParseError | null>(null);
  const [status, setStatus] = useState('');
  const [dialog, setDialog] = useState<DialogName>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [filters, setFilters] = useState<Parameters<typeof ReviewRail>[0]['filters']>();
  const loadRef = useRef<HTMLDialogElement>(null);
  const exportRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);

  const active = model === null ? null : { files: model.files, state: reviewState };
  const flags = useMemo(() => (active === null ? [] : analyze(active.files).flags), [active]);

  function openDialog(name: Exclude<DialogName, null>): void {
    setDialog(name);
    const refs = { load: loadRef, export: exportRef, help: helpRef, settings: settingsRef };
    refs[name].current?.showModal();
  }

  function closeDialog(): void {
    const refs = { load: loadRef, export: exportRef, help: helpRef, settings: settingsRef };
    if (dialog !== null) refs[dialog].current?.close();
    setDialog(null);
  }

  function loadText(text: string): void {
    const loaded = parseLoaded(text);
    if ('code' in loaded) {
      setError(loaded);
      setStatus(loaded.title);
      return;
    }
    setError(null);
    setModel(loaded);
    dispatch({ type: 'hydrate', state: loaded.state });
    setStatus(`Loaded ${loaded.files.length} files, ${loaded.state.hunkIds.length} hunks.`);
    if (dialog !== null) closeDialog();
  }

  function loadSample(sample: BuiltInSample): void {
    loadText(sample.text);
  }

  async function loadFile(file: File): Promise<void> {
    try {
      loadText(new TextDecoder().decode(await file.arrayBuffer()));
    } catch {
      setError({
        code: 'internal',
        title: "That file isn't text",
        detail: 'Could not read the selected file.',
        hint: 'generic',
        suggestion: 'Choose another text diff.',
      });
    }
  }

  if (active === null) {
    return (
      <>
        <Landing
          error={error}
          status={status}
          onLoadText={loadText}
          onLoadFile={(file) => {
            void loadFile(file);
          }}
          onLoadSample={loadSample}
          onError={setError}
        />
        <dialog ref={loadRef}>
          <LoadDialog
            open
            onClose={closeDialog}
            onLoadText={loadText}
            onLoadFile={(file) => {
              void loadFile(file);
            }}
            onLoadSample={loadSample}
            error={error}
          />
        </dialog>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => {
            openDialog('load');
          }}
        >
          Load diff
        </button>
      </>
    );
  }

  return (
    <>
      <header className="site-header review-header">
        <h1>Diff Review Desk</h1>
        <span>{reviewState.label}</span>
        <button
          type="button"
          onClick={() => {
            openDialog('load');
          }}
        >
          Load diff
        </button>
        <button
          type="button"
          onClick={() => {
            openDialog('export');
          }}
        >
          Export
        </button>
        <button
          type="button"
          onClick={() => {
            openDialog('settings');
          }}
        >
          Settings
        </button>
        <button
          type="button"
          onClick={() => {
            openDialog('help');
          }}
        >
          Shortcuts and help
        </button>
      </header>
      <div className="review-layout">
        <ReviewRail
          files={active.files}
          reviewState={reviewState}
          flags={flags}
          filters={filters}
          onFiltersChange={setFilters}
        />
        <main id="main" className="review-main">
          <p className="status-line" aria-live="polite">
            {status}
          </p>
          {hunkEntries(active.files).map(({ file, hunk }, index) => (
            <HunkCard
              key={hunk.id}
              file={file}
              hunk={hunk}
              hunkNumber={index + 1}
              totalHunks={reviewState.hunkIds.length}
              reviewState={reviewState}
              flags={flags}
              onDecision={(decision) => {
                dispatch(
                  decision === null
                    ? { type: 'clear', id: hunk.id }
                    : { type: 'decide', id: hunk.id, decision },
                );
              }}
              onComment={(comment) => {
                dispatch({ type: 'setComment', id: hunk.id, comment });
              }}
            />
          ))}
        </main>
      </div>
      <dialog ref={loadRef}>
        <LoadDialog
          open
          onClose={closeDialog}
          onLoadText={loadText}
          onLoadFile={(file) => {
            void loadFile(file);
          }}
          onLoadSample={loadSample}
          error={error}
        />
      </dialog>
      <dialog ref={exportRef}>
        <ExportDialog
          state={reviewState}
          files={active.files}
          flags={flags}
          onClose={closeDialog}
        />
      </dialog>
      <dialog ref={helpRef}>
        <HelpDialog onClose={closeDialog} />
      </dialog>
      <dialog ref={settingsRef}>
        <SettingsDialog prefs={prefs} onPrefsChange={setPrefs} onClose={closeDialog} />
      </dialog>
      {BUILT_IN_SAMPLES.length === 0 ? null : null}
    </>
  );
}
