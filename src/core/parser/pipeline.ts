import { hasStructuralEscape, stripAnsi } from './ansi';
import { suspiciousLine } from './hidden-chars';
import { decodeUtf8Lossy, type ByteDecode } from './utf8';

export type PipelineWarningCode =
  | 'crlf-normalised'
  | 'mixed-eol'
  | 'ansi-stripped'
  | 'fence-unwrapped'
  | 'nul-replaced'
  | 'invalid-utf8';

export type PipelineWarning = {
  readonly code: PipelineWarningCode;
  readonly count: number;
  readonly sample: string;
};

export type PreparedText = {
  readonly text: string;
  readonly lines: readonly string[];
  readonly warnings: readonly PipelineWarning[];
  readonly nulLines: ReadonlySet<number>;
  readonly suspiciousLines: ReadonlySet<number>;
  readonly invalidUtf8: number;
};

type NulReplacement = {
  readonly text: string;
  readonly nulLines: ReadonlySet<number>;
};

function trimHorizontal(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && (value[start] === ' ' || value[start] === '\t')) {
    start += 1;
  }
  while (end > start && (value[end - 1] === ' ' || value[end - 1] === '\t')) {
    end -= 1;
  }
  return value.slice(start, end);
}

function pushWarning(warnings: PipelineWarning[], code: PipelineWarningCode, sample: string): void {
  const existing = warnings.find((warning) => warning.code === code);
  if (existing !== undefined) {
    (existing as { count: number }).count += 1;
    return;
  }
  warnings.push({ code, count: 1, sample: sample.slice(0, 120) });
}

function countOccurrences(source: string, needle: string): number {
  let count = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === needle) {
      count += 1;
    }
  }
  return count;
}

function unwrapFence(source: string): { text: string; changed: boolean } {
  const lines = source.split('\n');
  let first = 0;
  while (first < lines.length && trimHorizontal(lines[first] ?? '') === '') {
    first += 1;
  }
  let last = lines.length - 1;
  while (last >= first && trimHorizontal(lines[last] ?? '') === '') {
    last -= 1;
  }
  if (
    first > last ||
    !lines[first]?.startsWith('```') ||
    trimHorizontal(lines[last] ?? '') !== '```'
  ) {
    return { text: source, changed: false };
  }
  const opening = lines[first] ?? '';
  if (opening.length > 3 && !/^[`]{3}[A-Za-z0-9_-]*$/.test(opening)) {
    return { text: source, changed: false };
  }
  return { text: lines.slice(first + 1, last).join('\n'), changed: true };
}

function hasMixedEol(source: string): { hasLf: boolean; allCrLf: boolean; mixed: boolean } {
  let hasLf = false;
  let allCrLf = true;
  let hasCr = false;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\r') {
      hasCr = true;
    }
    if (source[index] === '\n') {
      hasLf = true;
      if (index === 0 || source[index - 1] !== '\r') {
        allCrLf = false;
      }
    }
  }
  return { hasLf, allCrLf, mixed: hasLf && hasCr && !allCrLf };
}

function splitLines(text: string): string[] {
  const lines = text.split('\n');
  if (text.endsWith('\n')) {
    lines.pop();
  }
  return lines;
}

function normaliseEol(text: string, warnings: PipelineWarning[]): string {
  const eol = hasMixedEol(text);
  if (eol.hasLf && eol.allCrLf) {
    pushWarning(warnings, 'crlf-normalised', 'CRLF line endings were normalised.');
    return text.replace(/\r\n/g, '\n');
  }
  if (eol.mixed) {
    pushWarning(warnings, 'mixed-eol', 'Mixed line endings were retained.');
  }
  return text;
}

function hasStructuralEscapeLine(text: string): boolean {
  for (const line of splitLines(text)) {
    if (hasStructuralEscape(line)) {
      return true;
    }
  }
  return false;
}

function replaceNul(text: string): NulReplacement {
  const nulLines = new Set<number>();
  const replaced: string[] = [];
  const sourceLines = splitLines(text);
  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
    const line = sourceLines[lineIndex] ?? '';
    if (line.includes('\0')) {
      nulLines.add(lineIndex);
      replaced.push(line.replace(/\0/g, '␀'));
    } else {
      replaced.push(line);
    }
  }
  return { text: replaced.join('\n'), nulLines };
}

function findSuspiciousLines(lines: readonly string[]): Set<number> {
  const suspiciousLines = new Set<number>();
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (suspiciousLine(lines[lineIndex] ?? '')) {
      suspiciousLines.add(lineIndex);
    }
  }
  return suspiciousLines;
}

export function prepareText(source: string, invalidUtf8 = 0): PreparedText {
  const warnings: PipelineWarning[] = [];
  let text = normaliseEol(source, warnings);
  if (invalidUtf8 > 0) {
    warnings.push({ code: 'invalid-utf8', count: invalidUtf8, sample: '�' });
  }
  const fence = unwrapFence(text);
  if (fence.changed) {
    text = fence.text;
    pushWarning(warnings, 'fence-unwrapped', 'One Markdown code fence was removed.');
  }
  if (hasStructuralEscapeLine(text)) {
    text = stripAnsi(text);
    pushWarning(warnings, 'ansi-stripped', 'ANSI colour sequences were removed.');
  }
  let nulLines: ReadonlySet<number> = new Set<number>();
  if (text.includes('\0')) {
    const nulCount = countOccurrences(text, '\0');
    const replacement = replaceNul(text);
    text = replacement.text;
    nulLines = replacement.nulLines;
    warnings.push({
      code: 'nul-replaced',
      count: nulCount,
      sample: 'NUL characters were replaced with visible symbols.',
    });
  }
  const lines = splitLines(text);
  const suspiciousLines = findSuspiciousLines(lines);
  return { text, lines, warnings, nulLines, suspiciousLines, invalidUtf8 };
}

function looksUtf16(bytes: Uint8Array): boolean {
  if (bytes.length < 4) {
    return false;
  }
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    return true;
  }
  const sampleLength = Math.min(64, bytes.length);
  let evenNul = 0;
  let oddNul = 0;
  let evenAscii = 0;
  let oddAscii = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const value = bytes[index] ?? 0;
    if (value === 0) {
      if (index % 2 === 0) {
        evenNul += 1;
      } else {
        oddNul += 1;
      }
    } else if (value <= 0x7f) {
      if (index % 2 === 0) {
        evenAscii += 1;
      } else {
        oddAscii += 1;
      }
    } else {
      return false;
    }
  }
  return (oddNul >= 4 && evenAscii >= oddNul) || (evenNul >= 4 && oddAscii >= evenNul);
}

export function prepareBytes(bytes: Uint8Array): {
  readonly utf16: boolean;
  readonly decoded: ByteDecode;
} {
  return { utf16: looksUtf16(bytes), decoded: decodeUtf8Lossy(bytes) };
}
