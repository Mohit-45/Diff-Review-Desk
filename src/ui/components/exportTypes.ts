export type ExportFormat = 'agent-feedback' | 'summary';

export type ExportWarningTarget = 'pending' | 'rejected-comment' | 'parse-notes' | 'redactions';

export type ExportWarning = {
  readonly target: ExportWarningTarget;
  readonly label: string;
  readonly count: number;
};
