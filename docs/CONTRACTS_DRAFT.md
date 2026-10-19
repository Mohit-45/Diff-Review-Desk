# Draft for src/core/types.ts

Planning document only; no source file has been created. Base fields follow
SPEC section 6 with readonly properties and collections. Closed warning and P0
rule unions follow sections 7 and 8. The draft becomes a source contract at M0,
after approval; later non-optional contract changes require another approval.

```ts
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
  | 'binary-file';

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

export type ReviewState = {
  readonly fingerprint: string;
  readonly round: number;
  readonly label: string;
  readonly overallNote: string;
  readonly hunks: Readonly<
    Record<
      string,
      {
        readonly decision: 'approved' | 'rejected' | null;
        readonly comment: string;
      }
    >
  >;
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
  readonly decisions: ReviewState['hunks'];
  readonly hunkIds: ReviewState['hunkIds'];
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
```

## Boundary decisions to finish at M0

- `lineClasses` counts partition every pipeline input line exactly once.
  `orphanLines` is a diagnostic count, not another partition bucket.
  `workUnits` counts scan work, not elapsed time.
- `WarningCode` covers all 21 specified parser warning codes. Risk notices such
  as long-line and rule failure are separate typed analysis results, not new
  parser warnings or fake rule ids. `RuleId` initially covers the 17 P0 rules.
  No P1 registry entries ship before their tests and full gates.
- `StoredReview` is the versioned storage envelope, not raw parsed input.
  `updatedAt` is an injected ISO string for eviction/recency; validation rejects
  unknown keys. `carryoverDismissed` is optional to preserve dismissal on reload.
  Stored comments, notes and labels are redacted before serialisation.
- Shared operation signatures and their discriminated input/output types will
  be frozen by the lead at M0 before any agent launches: parseDiff, analyze,
  findSecretSpans, visualizeText, reviewReducer, history, carryOver,
  parseReviewRecord, decode, openDiff, persist, clearAll, both exporters and
  resolveCommand. No agent may substitute a private competing contract.
- Text controls are a blocking contract detail: React form values are not text
  nodes, while the specification explicitly requires intake/editor/preview
  textareas. The proposal is to keep untrusted diff display in SafeText text
  nodes, and treat only the explicitly specified textarea values as inert
  form-value sinks. They never become HTML, URLs, inline CSS or event handlers.
  Export preview is already redacted/escaped. Diff-derived accessible labels
  must use a sanitised textual equivalent, not raw secrets/hidden characters.
  This clarification is proposed, not silently applied.
