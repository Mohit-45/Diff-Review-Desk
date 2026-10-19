import type { DiffFile, DiffLine, Hunk, RuleId } from '../types';
import { LIMITS } from '../limits';
import { P0_RULES } from './rules/registry';

export type RiskSeverity = 'high' | 'medium' | 'low';

export type RiskLine = {
  readonly hunk: Hunk;
  readonly line: DiffLine;
  readonly lineIndex: number;
  readonly lineNumber: number | null;
  readonly text: string;
  readonly scanText: string;
};

export type RuleMatch = {
  readonly hunkId: string | null;
  readonly lines?: readonly number[];
  readonly evidence?: string;
  readonly count?: number;
};

export type RuleContext = {
  readonly file: DiffFile;
  readonly allFiles: readonly DiffFile[];
  readonly path: string;
  readonly pathLower: string;
  readonly addedLines: readonly RiskLine[];
  readonly removedLines: readonly RiskLine[];
  readonly allLines: readonly RiskLine[];
  readonly candidateAddedLines: readonly RiskLine[];
  readonly isTestPath: boolean;
  readonly isGeneratedPath: boolean;
  readonly isVendoredPath: boolean;
  readonly isLockPath: boolean;
  readonly isDocsPath: boolean;
};

export type RiskRule = {
  readonly id: RuleId;
  readonly severity: RiskSeverity;
  readonly title: string;
  readonly why: string;
  readonly prefilter: readonly string[];
  readonly pattern?: RegExp;
  readonly scanWholeLine?: boolean;
  readonly capOnPaths?: boolean;
  readonly evaluate: (context: RuleContext) => readonly RuleMatch[];
};

export type RiskConfig = {
  readonly rules?: readonly RiskRule[];
  readonly registry?: readonly RiskRule[];
  readonly maxLineScanChars?: number;
};

export const SECRET_LENGTH_BUCKET = 8;

export const P0_RULE_IDS = [
  'secret-known-token',
  'sensitive-file-added',
  'hidden-unicode',
  'test-file-deleted',
  'test-assertion-removed',
  'ai-elision-marker',
  'shell-dangerous-command',
  'tls-verification-disabled',
  'secret-assignment',
  'test-disabled',
  'suppression-added',
  'placeholder-introduced',
  'dependency-added',
  'ci-container-changed',
  'file-mode-changed',
  'file-deleted',
  'binary-file',
] as const satisfies readonly RuleId[];

export const P0_RULE_SEVERITIES: Readonly<Record<RiskSeverity, number>> = {
  high: 8,
  medium: 9,
  low: 0,
};

export const RISK_RULES: readonly RiskRule[] = P0_RULES;
export const DEFAULT_RISK_CONFIG: Required<Pick<RiskConfig, 'rules' | 'maxLineScanChars'>> = {
  rules: RISK_RULES,
  maxLineScanChars: LIMITS.maxLineScanChars,
};

export { P0_RULES };
