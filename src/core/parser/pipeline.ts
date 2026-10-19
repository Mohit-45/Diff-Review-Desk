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

type ByteDecode = {
  readonly text: string;
  readonly invalid: number;
};

function whitespace(value: string): boolean {
  const codePoint = value.codePointAt(0);
  if (codePoint === undefined) {
    return true;
  }
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0b ||
    codePoint === 0x0c ||
    codePoint === 0x0d ||
    codePoint === 0x20 ||
    codePoint === 0x85 ||
    codePoint === 0xa0 ||
    codePoint === 0x1680 ||
    (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x202f ||
    codePoint === 0x205f ||
    codePoint === 0x3000 ||
    codePoint === 0xfeff
  );
}

export function isBlankText(text: string): boolean {
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined || !whitespace(String.fromCodePoint(codePoint))) {
      return false;
    }
    index += codePoint > 0xffff ? 2 : 1;
  }
  return true;
}

export function utf8ByteLength(text: string): number {
  let total = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) {
      total += 1;
    } else if (code <= 0x7ff) {
      total += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        total += 4;
        index += 1;
      } else {
        total += 3;
      }
    } else {
      total += 3;
    }
  }
  return total;
}

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

function hasStructuralEscape(line: string): boolean {
  if (line.length === 0 || line.charCodeAt(0) !== 0x1b) {
    return false;
  }
  let index = 1;
  if (line[index] === '[') {
    index += 1;
    while (
      index < line.length &&
      line.charCodeAt(index) >= 0x30 &&
      line.charCodeAt(index) <= 0x3f
    ) {
      index += 1;
    }
    while (
      index < line.length &&
      line.charCodeAt(index) >= 0x20 &&
      line.charCodeAt(index) <= 0x2f
    ) {
      index += 1;
    }
    index += 1;
  } else if (line[index] === ']') {
    index += 1;
    while (
      index < line.length &&
      line.charCodeAt(index) !== 0x07 &&
      line.charCodeAt(index) !== 0x1b
    ) {
      index += 1;
    }
    if (line.charCodeAt(index) === 0x1b && line[index + 1] === '\\') {
      index += 2;
    } else if (line.charCodeAt(index) === 0x07) {
      index += 1;
    }
  }
  const remainder = line.slice(index);
  return (
    remainder.startsWith('diff --git ') ||
    remainder.startsWith('diff --cc ') ||
    remainder.startsWith('--- ') ||
    remainder.startsWith('+++ ') ||
    remainder.startsWith('@@ ') ||
    remainder.startsWith('index ') ||
    remainder.startsWith('old mode ') ||
    remainder.startsWith('new mode ') ||
    remainder.startsWith('new file mode ') ||
    remainder.startsWith('deleted file mode ') ||
    remainder.startsWith('similarity index ') ||
    remainder.startsWith('rename from ') ||
    remainder.startsWith('rename to ') ||
    remainder.startsWith('copy from ') ||
    remainder.startsWith('copy to ') ||
    remainder.startsWith('Binary files ')
  );
}

function stripAnsi(source: string): string {
  const output: string[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.charCodeAt(index) !== 0x1b) {
      output.push(source[index] ?? '');
      index += 1;
      continue;
    }
    const next = source[index + 1];
    index += 2;
    if (next === '[') {
      while (index < source.length) {
        const code = source.charCodeAt(index);
        index += 1;
        if (code >= 0x40 && code <= 0x7e) {
          break;
        }
      }
      continue;
    }
    if (next === ']') {
      while (index < source.length) {
        const code = source.charCodeAt(index);
        if (code === 0x07) {
          index += 1;
          break;
        }
        if (code === 0x1b && source[index + 1] === '\\') {
          index += 2;
          break;
        }
        index += 1;
      }
    }
  }
  return output.join('');
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
  if (opening.length > 3 && !/^[\u0060]{3}[A-Za-z0-9_-]*$/.test(opening)) {
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

function isHiddenOrControl(codePoint: number): boolean {
  if ((codePoint <= 0x1f && codePoint !== 0x09) || (codePoint >= 0x7f && codePoint <= 0x9f)) {
    return true;
  }
  if (
    (codePoint >= 0x0600 && codePoint <= 0x0605) ||
    codePoint === 0x061c ||
    codePoint === 0x06dd ||
    codePoint === 0x070f ||
    (codePoint >= 0x0890 && codePoint <= 0x0891) ||
    codePoint === 0x08e2 ||
    (codePoint >= 0x180e && codePoint <= 0x180f) ||
    (codePoint >= 0x200e && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    (codePoint >= 0x206a && codePoint <= 0x206f)
  ) {
    return true;
  }
  if (
    (codePoint >= 0x200b && codePoint <= 0x200d) ||
    (codePoint >= 0x2060 && codePoint <= 0x2064)
  ) {
    return true;
  }
  if (
    codePoint === 0xfeff ||
    codePoint === 0x00ad ||
    codePoint === 0x034f ||
    codePoint === 0x115f ||
    codePoint === 0x1160 ||
    codePoint === 0x17b4 ||
    codePoint === 0x17b5 ||
    codePoint === 0x180e ||
    codePoint === 0x2800 ||
    codePoint === 0x3164 ||
    codePoint === 0xffa0 ||
    (codePoint >= 0xfff9 && codePoint <= 0xfffb) ||
    (codePoint >= 0xe0000 && codePoint <= 0xe007f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x85
  ) {
    return true;
  }
  return false;
}

function suspiciousLine(text: string): boolean {
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }
    if (isHiddenOrControl(codePoint)) {
      return true;
    }
    index += codePoint > 0xffff ? 2 : 1;
  }
  return false;
}

function splitLines(text: string): string[] {
  const lines = text.split('\n');
  if (text.endsWith('\n')) {
    lines.pop();
  }
  return lines;
}

export function prepareText(source: string, invalidUtf8 = 0): PreparedText {
  let text = source;
  const warnings: PipelineWarning[] = [];
  const eol = hasMixedEol(text);
  if (eol.hasLf && eol.allCrLf) {
    text = text.replace(/\r\n/g, '\n');
    pushWarning(warnings, 'crlf-normalised', 'CRLF line endings were normalised.');
  } else if (eol.mixed) {
    pushWarning(warnings, 'mixed-eol', 'Mixed line endings were retained.');
  }
  if (invalidUtf8 > 0) {
    warnings.push({ code: 'invalid-utf8', count: invalidUtf8, sample: '\ufffd' });
  }
  const fence = unwrapFence(text);
  if (fence.changed) {
    text = fence.text;
    pushWarning(warnings, 'fence-unwrapped', 'One Markdown code fence was removed.');
  }
  let ansi = false;
  for (const line of splitLines(text)) {
    if (hasStructuralEscape(line)) {
      ansi = true;
      break;
    }
  }
  if (ansi) {
    text = stripAnsi(text);
    pushWarning(warnings, 'ansi-stripped', 'ANSI colour sequences were removed.');
  }
  const nulLines = new Set<number>();
  if (text.includes('\0')) {
    const nulCount = countOccurrences(text, '\0');
    const replaced: string[] = [];
    const sourceLines = splitLines(text);
    for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
      const line = sourceLines[lineIndex] ?? '';
      if (line.includes('\0')) {
        nulLines.add(lineIndex);
        replaced.push(line.replace(/\0/g, '\u2400'));
      } else {
        replaced.push(line);
      }
    }
    text = replaced.join('\n');
    warnings.push({
      code: 'nul-replaced',
      count: nulCount,
      sample: 'NUL characters were replaced with visible symbols.',
    });
  }
  const lines = splitLines(text);
  const suspiciousLines = new Set<number>();
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (suspiciousLine(lines[lineIndex] ?? '')) {
      suspiciousLines.add(lineIndex);
    }
  }
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

function decodeBytes(bytes: Uint8Array): ByteDecode {
  let text = '';
  let invalid = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index] ?? 0;
    if (first < 0x80) {
      text += String.fromCharCode(first);
      continue;
    }
    const width = first < 0xe0 ? 2 : first < 0xf0 ? 3 : first < 0xf8 ? 4 : 0;
    if (width === 0 || index + width > bytes.length) {
      text += '\ufffd';
      invalid += 1;
      continue;
    }
    let codePoint = width === 2 ? first & 0x1f : width === 3 ? first & 0x0f : first & 0x07;
    let valid = true;
    for (let offset = 1; offset < width; offset += 1) {
      const part = bytes[index + offset] ?? 0;
      if ((part & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      codePoint = (codePoint << 6) | (part & 0x3f);
    }
    const minimum = width === 2 ? 0x80 : width === 3 ? 0x800 : 0x10000;
    if (
      !valid ||
      codePoint < minimum ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      text += '\ufffd';
      invalid += 1;
      continue;
    }
    text += String.fromCodePoint(codePoint);
    index += width - 1;
  }
  return { text, invalid };
}

export function prepareBytes(bytes: Uint8Array): {
  readonly utf16: boolean;
  readonly decoded: ByteDecode;
} {
  return { utf16: looksUtf16(bytes), decoded: decodeBytes(bytes) };
}

export function nulInFirstBytes(text: string, limit = 8_000): boolean {
  let bytes = 0;
  for (let index = 0; index < text.length && bytes < limit; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0) {
      return true;
    }
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return false;
}
