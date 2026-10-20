export type HunkHeader = {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly section: string;
};

const METADATA_PREFIXES: readonly string[] = [
  'index ',
  'old mode ',
  'new mode ',
  'new file mode ',
  'deleted file mode ',
  'similarity index ',
  'rename from ',
  'rename to ',
  'copy from ',
  'copy to ',
  'old file mode ',
];

export function cleanHeaderLine(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function lineStarts(line: string, prefix: string): boolean {
  return cleanHeaderLine(line).startsWith(prefix);
}

export function isBodyLike(line: string): boolean {
  return (
    line.length > 0 && (line[0] === ' ' || line[0] === '+' || line[0] === '-' || line[0] === '\\')
  );
}

export function isDiffHeader(line: string): boolean {
  return lineStarts(line, 'diff --git ');
}

export function isCombinedHeader(line: string): boolean {
  return lineStarts(line, 'diff --cc ') || lineStarts(line, 'diff --combined ');
}

export function isCommitHeader(line: string): boolean {
  return (
    /^commit [0-9a-f]{40}(?:\b|$)/i.test(cleanHeaderLine(line)) ||
    /^From [0-9a-f]{40}(?: |$)/i.test(cleanHeaderLine(line)) ||
    /^commit [0-9a-f]{64}(?:\b|$)/i.test(cleanHeaderLine(line)) ||
    /^From [0-9a-f]{64}(?: |$)/i.test(cleanHeaderLine(line))
  );
}

export function isMailSignature(lines: readonly string[], index: number): boolean {
  const line = cleanHeaderLine(lines[index] ?? '');
  if (line !== '-- ') {
    return false;
  }
  const next = cleanHeaderLine(lines[index + 1] ?? '');
  return index + 1 >= lines.length || /^\d+\.\d+(?:\.\d+)?/.test(next);
}

export function isHeaderPair(lines: readonly string[], index: number): boolean {
  const first = cleanHeaderLine(lines[index] ?? '');
  const second = cleanHeaderLine(lines[index + 1] ?? '');
  return (
    (first.startsWith('--- ') || first.startsWith('---\t')) &&
    (second.startsWith('+++ ') || second.startsWith('+++\t'))
  );
}

export function parseHunkHeader(line: string, maxLength: number): HunkHeader | null {
  const clean = cleanHeaderLine(line);
  if (clean.length > maxLength || !clean.startsWith('@@ ')) {
    return null;
  }
  const match = /^@@ -(\d{1,9})(?:,(\d{1,9}))? \+(\d{1,9})(?:,(\d{1,9}))? @@(.*)$/.exec(clean);
  if (match === null) {
    return null;
  }
  const oldStart = Number(match[1]);
  const oldCount = match[2] === undefined ? 1 : Number(match[2]);
  const newStart = Number(match[3]);
  const newCount = match[4] === undefined ? 1 : Number(match[4]);
  if (![oldStart, oldCount, newStart, newCount].every(Number.isSafeInteger)) {
    return null;
  }
  return { oldStart, oldCount, newStart, newCount, section: (match[5] ?? '').slice(0, 200) };
}

export function hunkCandidate(line: string): boolean {
  return cleanHeaderLine(line).startsWith('@@');
}

export function headerLineTooLong(line: string, maxLength: number): boolean {
  return (
    cleanHeaderLine(line).length > maxLength &&
    (hunkCandidate(line) ||
      lineStarts(line, 'diff ') ||
      lineStarts(line, '---') ||
      lineStarts(line, '+++'))
  );
}

export function isMetadataLine(line: string): boolean {
  const clean = cleanHeaderLine(line);
  return METADATA_PREFIXES.some((prefix) => clean.startsWith(prefix));
}

export function isBinaryLine(line: string): boolean {
  const clean = cleanHeaderLine(line);
  return clean.startsWith('Binary files ') || clean === 'GIT binary patch';
}

export function isSeparator(line: string): boolean {
  return cleanHeaderLine(line) === '' || cleanHeaderLine(line) === '---';
}

export function isLikelyTrailer(lines: readonly string[], index: number): boolean {
  const clean = cleanHeaderLine(lines[index] ?? '');
  return (
    isSeparator(clean) ||
    isMailSignature(lines, index) ||
    isCommitHeader(clean) ||
    clean.startsWith('diff --git ')
  );
}
