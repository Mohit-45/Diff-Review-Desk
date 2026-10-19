export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export type DiffLine = {
  readonly kind: 'context' | 'add' | 'remove';
  readonly text: string;
  readonly oldNo: number | null;
  readonly newNo: number | null;
  readonly noEol?: true;
  readonly cr?: true;
  readonly suspect?: true;
};

export type MetaReason =
  | 'rename'
  | 'copy'
  | 'mode-change'
  | 'type-change'
  | 'binary'
  | 'empty-file'
  | 'no-hunks'
  | 'content-omitted'
  | 'combined'
  | 'unparsed';

export type Hunk = {
  readonly id: string;
  readonly fileId: string;
  readonly index: number;
  readonly kind: 'text' | 'meta';
  readonly meta: readonly MetaReason[];
  readonly header: string | null;
  readonly section: string;
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: readonly DiffLine[];
  readonly added: number;
  readonly removed: number;
  readonly truncated: boolean;
  readonly countMismatch: boolean;
  readonly hash: string;
};

export type DiffFile = {
  readonly id: string;
  readonly displayPath: string;
  readonly oldPath: string | null;
  readonly newPath: string | null;
  readonly status: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';
  readonly similarity: number | null;
  readonly oldMode: string | null;
  readonly newMode: string | null;
  readonly kind: 'regular' | 'executable' | 'symlink' | 'submodule';
  readonly binary: boolean;
  readonly generated: boolean;
  readonly hunks: readonly Hunk[];
  readonly added: number;
  readonly removed: number;
  readonly incomplete: boolean;
};

export type ParseError = {
  readonly code:
    | 'empty'
    | 'not-a-diff'
    | 'word-diff'
    | 'binary-input'
    | 'too-large'
    | 'too-many-files'
    | 'too-many-lines'
    | 'internal';
  readonly title: string;
  readonly detail: string;
  readonly hint: 'web-page' | 'summary' | 'other-format' | 'utf16' | 'generic' | null;
  readonly suggestion: string | null;
};

export type WarningCode =
  | 'hunk-truncated'
  | 'hunk-count-mismatch'
  | 'bad-hunk-header'
  | 'orphan-lines'
  | 'unknown-lines'
  | 'combined-unsupported'
  | 'nul-replaced'
  | 'invalid-utf8'
  | 'suspicious-chars'
  | 'path-encoding'
  | 'ambiguous-path'
  | 'hunks-out-of-order'
  | 'file-header-truncated'
  | 'crlf-normalised'
  | 'ansi-stripped'
  | 'fence-unwrapped'
  | 'mixed-eol'
  | 'preamble-ignored'
  | 'trailer-ignored'
  | 'duplicate-path'
  | 'no-hunks';

export type ParseWarning = {
  readonly code: WarningCode;
  readonly level: 'info' | 'warn';
  readonly message: string;
  readonly fileId: string | null;
  readonly srcLine: number | null;
  readonly count: number;
  readonly samples: readonly string[];
};

export type LineClass =
  | 'preamble'
  | 'fileHeader'
  | 'hunkHeader'
  | 'hunkBody'
  | 'separator'
  | 'trailer'
  | 'binaryPayload'
  | 'unknown';

export type ParseStats = {
  readonly inputBytes: number;
  readonly totalLines: number;
  readonly lineClasses: Readonly<Record<LineClass, number>>;
  readonly orphanLines: number;
  readonly warningsDropped: number;
  readonly workUnits: number;
};

export type ParseResult =
  | {
      readonly ok: true;
      readonly fingerprint: string;
      readonly files: readonly DiffFile[];
      readonly warnings: readonly ParseWarning[];
      readonly stats: ParseStats;
    }
  | {
      readonly ok: false;
      readonly error: ParseError;
      readonly warnings: readonly ParseWarning[];
    };

export type RuleId =
  | 'secret-known-token'
  | 'sensitive-file-added'
  | 'hidden-unicode'
  | 'test-file-deleted'
  | 'test-assertion-removed'
  | 'ai-elision-marker'
  | 'shell-dangerous-command'
  | 'tls-verification-disabled'
  | 'secret-assignment'
  | 'test-disabled'
  | 'suppression-added'
  | 'placeholder-introduced'
  | 'dependency-added'
  | 'ci-container-changed'
  | 'file-mode-changed'
  | 'file-deleted'
  | 'binary-file'
  | 'dependency-install-script'
  | 'dynamic-code-exec'
  | 'lockfile-manifest-mismatch'
  | 'debug-leftover';

export type Flag = {
  readonly ruleId: RuleId;
  readonly severity: 'high' | 'medium' | 'low';
  readonly title: string;
  readonly why: string;
  readonly fileId: string;
  readonly hunkId: string | null;
  readonly lines: readonly number[];
  readonly count: number;
  readonly evidence?: string;
};

export type HunkReview = {
  readonly decision: 'approved' | 'rejected' | null;
  readonly comment: string;
};

export type ReviewState = {
  readonly fingerprint: string;
  readonly round: number;
  readonly label: string;
  readonly overallNote: string;
  readonly hunks: Readonly<Record<string, HunkReview>>;
  readonly hunkIds: readonly string[];
  readonly prior: null | {
    readonly round: number;
    readonly unchangedIds: readonly string[];
    readonly carried: Readonly<Record<string, 'approved' | 'rejected'>>;
    readonly goneCount: number;
    readonly goneRejected: number;
  };
};

export type Prefs = {
  readonly theme: 'system' | 'light' | 'dark';
  readonly shortcutsEnabled: boolean;
  readonly autoAdvance: boolean;
  readonly rememberDiff: boolean;
};

export type StorageError = {
  readonly code: 'denied' | 'quota' | 'unavailable';
  readonly title: string;
  readonly detail: string;
  readonly suggestion: string;
};

export type ValidationError = {
  readonly code: 'too-large' | 'corrupt' | 'future-schema' | 'hash-version' | 'invalid-field';
  readonly message: string;
};

export type StoredReview = {
  readonly schemaVersion: 1;
  readonly hashVersion: 1;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly round: number;
  readonly label: string;
  readonly overallNote: string;
  readonly decisions: Readonly<Record<string, HunkReview>>;
  readonly hunkIds: readonly string[];
  readonly prior: ReviewState['prior'];
  readonly carryoverDismissed?: boolean;
};

export type Command =
  | 'next-hunk'
  | 'previous-hunk'
  | 'next-pending'
  | 'previous-pending'
  | 'next-file'
  | 'previous-file'
  | 'approve'
  | 'reject'
  | 'clear'
  | 'comment'
  | 'collapse-hunk'
  | 'export'
  | 'load'
  | 'settings'
  | 'help'
  | 'path-filter'
  | 'undo'
  | 'redo'
  | 'close'
  | 'commit-comment';

export type KeymapRow = {
  readonly id: Command;
  readonly keys: readonly string[];
  readonly help: string;
  readonly buttonLabel: string | null;
  readonly contextual: boolean;
};

export type DecoderInput =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array };

export type RuleNotice = {
  readonly ruleId: RuleId | null;
  readonly fileId: string;
  readonly message: string;
};
