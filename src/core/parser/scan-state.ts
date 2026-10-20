import type { LIMITS } from '../limits';
import type {
  DiffFile,
  DiffLine,
  Hunk,
  LineClass,
  MetaReason,
  ParseWarning,
  WarningCode,
} from '../types';

/** `LIMITS` is `as const`, so widen each value: callers may override a limit with a different number. */
export type ParserLimits = { readonly [Name in keyof typeof LIMITS]: number };

export type MutableLine = {
  kind: DiffLine['kind'];
  text: string;
  oldNo: number | null;
  newNo: number | null;
  noEol?: true;
  cr?: true;
  suspect?: true;
};

export type MutableHunk = {
  id: string;
  fileId: string;
  index: number;
  kind: Hunk['kind'];
  meta: MetaReason[];
  header: string | null;
  section: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: MutableLine[];
  added: number;
  removed: number;
  truncated: boolean;
  countMismatch: boolean;
  hash: string;
};

export type MutableFile = {
  id: string;
  displayPath: string;
  oldPath: string | null;
  newPath: string | null;
  status: DiffFile['status'];
  similarity: number | null;
  oldMode: string | null;
  newMode: string | null;
  kind: DiffFile['kind'];
  binary: boolean;
  generated: boolean;
  hunks: MutableHunk[];
  added: number;
  removed: number;
  incomplete: boolean;
  sourceGit: boolean;
  headerPathSeen: boolean;
  renameSeen: boolean;
  copySeen: boolean;
  combined: boolean;
  modeChanged: boolean;
  typeChanged: boolean;
  binaryMode: boolean;
  unparsedRuns: string[][];
  currentUnparsed: string[];
};

export type WarningRecord = {
  code: WarningCode;
  level: ParseWarning['level'];
  message: string;
  file: MutableFile | null;
  srcLine: number | null;
  count: number;
  samples: string[];
};

export type ScanState = {
  readonly lines: readonly string[];
  readonly nulLines: ReadonlySet<number>;
  readonly suspiciousLines: ReadonlySet<number>;
  readonly lineClasses: Record<LineClass, number>;
  readonly warnings: WarningRecord[];
  readonly files: MutableFile[];
  readonly limits: ParserLimits;
  warningsDropped: number;
  orphanLines: number;
  current: MutableFile | null;
  sawCommitHeader: boolean;
  sawHunkHeader: boolean;
  sawHeaderPair: boolean;
  workUnits: number;
};

export function addClass(state: ScanState, index: number, lineClass: LineClass): void {
  state.lineClasses[lineClass] += 1;
  state.workUnits += (state.lines[index] ?? '').length + 1;
}
