import type { Command } from '../core/types';
import { SafeText } from './components/SafeText';
import { KeyHint } from './KeyHint';
import { appMessages } from './messages/app';
import { ReviewSkipLinks } from './ReviewSkipLinks';
import type { SaveStatus } from './usePersistReview';

type HeaderButton = { readonly command: Command; readonly label: string };

const BUTTONS: readonly HeaderButton[] = [
  { command: 'undo', label: 'Undo' },
  { command: 'redo', label: 'Redo' },
  { command: 'load', label: 'Load diff' },
  { command: 'export', label: 'Export' },
  { command: 'settings', label: 'Settings' },
  { command: 'help', label: 'Shortcuts and help' },
];

type ReviewHeaderProps = {
  readonly label: string;
  readonly save: SaveStatus;
  readonly onCommand: (command: Command) => void;
  readonly onSkipToFiles: () => void;
  readonly onSkipToDiff: () => void;
};

const SAVE_TEXT: Readonly<Record<SaveStatus, string>> = {
  saved: appMessages.saved,
  saving: appMessages.saving,
  'not-saved': appMessages.notSaved,
};

/** Plain text, and an alert only when saving has failed. The element is keyed so the alert is new. */
function SaveIndicator({ status }: { readonly status: SaveStatus }) {
  return (
    <span
      key={status}
      className="save-indicator"
      data-state={status}
      role={status === 'not-saved' ? 'alert' : undefined}
    >
      {SAVE_TEXT[status]}
    </span>
  );
}

export function ReviewHeader({
  label,
  save,
  onCommand,
  onSkipToFiles,
  onSkipToDiff,
}: ReviewHeaderProps) {
  return (
    <header className="site-header review-header">
      <ReviewSkipLinks onSkipToFiles={onSkipToFiles} onSkipToDiff={onSkipToDiff} />
      <h1>Diff Review Desk</h1>
      <span>
        <SafeText>{label}</SafeText>
      </span>
      <SaveIndicator status={save} />
      {BUTTONS.map((button) => (
        <button
          key={button.command}
          type="button"
          onClick={() => {
            onCommand(button.command);
          }}
        >
          {button.label}
          <KeyHint command={button.command} />
        </button>
      ))}
    </header>
  );
}
