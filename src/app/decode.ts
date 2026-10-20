import { LIMITS } from '../core/limits';
import { fail, ok } from '../core/result';
import type { DecoderInput, ParseError, Result } from '../core/types';
import { stripAnsiOnStructuralLines } from './ansi';
import { hasNulInPrefix, hasUtf16Signature } from './byteSignatures';
import {
  binaryInputError,
  emptyDiffError,
  emptyFileError,
  tooLargeError,
  unreadableFileError,
  utf16Error,
} from './decodeErrors';

export type DecodeWarning = {
  readonly code:
    | 'invalid-utf8'
    | 'nul-replaced'
    | 'crlf-normalised'
    | 'mixed-eol'
    | 'ansi-stripped'
    | 'fence-unwrapped';
  readonly message: string;
  readonly count: number;
};

export type DecodedDiff = {
  readonly text: string;
  readonly inputBytes: number;
  readonly warnings: readonly DecodeWarning[];
};

const UTF8_BOM = '\uFEFF';

function bytesForText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function addWarning(
  warnings: readonly DecodeWarning[],
  code: DecodeWarning['code'],
  message: string,
  count = 1,
): readonly DecodeWarning[] {
  const existing = warnings.find((warning) => warning.code === code);
  if (existing === undefined) {
    return [...warnings, { code, message, count }];
  }
  return warnings.map((warning) =>
    warning.code === code ? { ...warning, count: warning.count + count } : warning,
  );
}

function unwrapFence(text: string): { readonly text: string; readonly unwrapped: boolean } {
  const lines = text.split('\n');
  if (lines.length < 2) {
    return { text, unwrapped: false };
  }
  const opening = lines[0]?.replace(/\r$/u, '').match(/^\s*```(?:diff|patch|text)?\s*$/iu);
  const closing = lines[lines.length - 1]?.replace(/\r$/u, '') === '```';
  if (opening === null || !closing) {
    return { text, unwrapped: false };
  }
  return { text: lines.slice(1, -1).join('\n'), unwrapped: true };
}

function normalizeLineEndings(text: string): {
  readonly text: string;
  readonly crlf: boolean;
  readonly mixed: boolean;
} {
  let crlfCount = 0;
  let bareLfCount = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '\n') {
      continue;
    }
    if (index > 0 && text[index - 1] === '\r') {
      crlfCount += 1;
    } else {
      bareLfCount += 1;
    }
  }
  if (crlfCount > 0 && bareLfCount === 0) {
    return { text: text.replaceAll('\r\n', '\n'), crlf: true, mixed: false };
  }
  return { text, crlf: false, mixed: crlfCount > 0 && bareLfCount > 0 };
}

const NUL_SCAN_BYTES = 8_000;

function decodeBytes(bytes: Uint8Array): Result<DecodedDiff, ParseError> {
  if (bytes.length > LIMITS.maxInputBytes) {
    return fail(tooLargeError(bytes.length));
  }
  if (hasUtf16Signature(bytes)) {
    return fail(utf16Error());
  }
  if (hasNulInPrefix(bytes, NUL_SCAN_BYTES)) {
    return fail(binaryInputError());
  }
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  let warnings: readonly DecodeWarning[] = [];
  const replacementCount = Array.from(decoded).filter((character) => character === '\uFFFD').length;
  if (replacementCount > 0) {
    warnings = addWarning(
      warnings,
      'invalid-utf8',
      'Some invalid UTF-8 bytes were replaced.',
      replacementCount,
    );
  }
  return finishDecode(decoded, bytes.length, warnings);
}

function decodeString(text: string): Result<DecodedDiff, ParseError> {
  const bytes = bytesForText(text);
  if (hasNulInPrefix(bytes, NUL_SCAN_BYTES)) {
    return fail(binaryInputError());
  }
  return finishDecode(text, bytes.length, []);
}

function finishDecode(
  input: string,
  inputBytes: number,
  initialWarnings: readonly DecodeWarning[],
): Result<DecodedDiff, ParseError> {
  if (inputBytes > LIMITS.maxInputBytes) {
    return fail(tooLargeError(inputBytes));
  }
  let text = input.startsWith(UTF8_BOM) ? input.slice(1) : input;
  let warnings = initialWarnings;
  const fence = unwrapFence(text);
  text = fence.text;
  if (fence.unwrapped) {
    warnings = addWarning(warnings, 'fence-unwrapped', 'One Markdown code fence was removed.');
  }
  const lineEndings = normalizeLineEndings(text);
  text = lineEndings.text;
  if (lineEndings.crlf) {
    warnings = addWarning(warnings, 'crlf-normalised', 'CRLF line endings were normalised.');
  } else if (lineEndings.mixed) {
    warnings = addWarning(warnings, 'mixed-eol', 'The input contains mixed line endings.');
  }
  const ansi = stripAnsiOnStructuralLines(text);
  text = ansi.text;
  if (ansi.count > 0) {
    warnings = addWarning(
      warnings,
      'ansi-stripped',
      'ANSI colour sequences were removed from structural lines.',
      ansi.count,
    );
  }
  const nulCount = Array.from(text).filter((character) => character === '\u0000').length;
  if (nulCount > 0) {
    text = text.replaceAll('\u0000', '\u2400');
    warnings = addWarning(warnings, 'nul-replaced', 'NUL characters were visualised.', nulCount);
  }
  if (/^\s*$/u.test(text)) {
    return fail(emptyDiffError());
  }
  return ok({ text, inputBytes, warnings });
}

export function decode(input: DecoderInput | string | Uint8Array): Result<DecodedDiff, ParseError> {
  if (typeof input === 'string') {
    return decodeString(input);
  }
  if (input instanceof Uint8Array) {
    return decodeBytes(input);
  }
  if (input.kind === 'text') {
    return decodeString(input.text);
  }
  return decodeBytes(input.bytes);
}

export function decodeText(text: string): Result<DecodedDiff, ParseError> {
  return decode(text);
}

export function decodeBytesInput(bytes: Uint8Array): Result<DecodedDiff, ParseError> {
  return decode(bytes);
}

export const decodeInput = decode;

export async function decodeFile(
  file: Pick<Blob, 'size' | 'arrayBuffer'> & { readonly name?: string },
): Promise<Result<DecodedDiff, ParseError>> {
  try {
    if (file.size === 0) {
      return fail(emptyFileError());
    }
    if (file.size > LIMITS.maxInputBytes) {
      return fail(tooLargeError(file.size));
    }
    const buffer = await file.arrayBuffer();
    return decodeBytes(new Uint8Array(buffer));
  } catch {
    return fail(unreadableFileError(file.name));
  }
}
