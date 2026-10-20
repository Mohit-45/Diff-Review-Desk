import { LIMITS } from '../limits';
import type { ParseResult } from '../types';
import {
  binaryInputResult,
  emptyResult,
  internalResult,
  tooLargeResult,
  utf16Result,
} from './errors';
import { prepareBytes, prepareText } from './pipeline';
import { parsePrepared } from './scan';
import type { ParserLimits } from './scan-state';
import { isBlankText, nulInFirstBytes, utf8ByteLength } from './text-chars';

export type ParserLimitOverrides = Partial<
  Pick<
    ParserLimits,
    'maxInputBytes' | 'maxFiles' | 'maxTotalDiffLines' | 'maxHeaderLineChars' | 'maxWarnings'
  >
>;

export type ParseOptions = {
  readonly limits?: ParserLimitOverrides;
};

const BYTE_ORDER_MARK = '\u{FEFF}';
const BINARY_SNIFF_BYTES = 8_000;

function resolveLimits(options: ParseOptions | undefined): ParserLimits {
  return { ...LIMITS, ...(options?.limits ?? {}) };
}

function stripByteOrderMark(text: string): string {
  return text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
}

/** Shared tail of both entry points: the checks that only need decoded text. */
function parseDecoded(
  text: string,
  invalidUtf8: number,
  inputBytes: number,
  limits: ParserLimits,
): ParseResult {
  if (isBlankText(text)) {
    return emptyResult();
  }
  const prepared = prepareText(text, invalidUtf8);
  if (prepared.lines.length > limits.maxTotalDiffLines) {
    return tooLargeResult(prepared.lines.length, limits.maxTotalDiffLines, 'lines');
  }
  return parsePrepared(prepared, inputBytes, limits);
}

function parseString(input: string, options: ParseOptions | undefined): ParseResult {
  const limits = resolveLimits(options);
  const text = stripByteOrderMark(input);
  const bytes = utf8ByteLength(text);
  if (bytes > limits.maxInputBytes) {
    return tooLargeResult(bytes, limits.maxInputBytes, 'bytes');
  }
  if (nulInFirstBytes(text)) {
    return binaryInputResult();
  }
  return parseDecoded(text, 0, bytes, limits);
}

function parseByteInput(bytes: Uint8Array, options: ParseOptions | undefined): ParseResult {
  const limits = resolveLimits(options);
  if (bytes.byteLength > limits.maxInputBytes) {
    return tooLargeResult(bytes.byteLength, limits.maxInputBytes, 'bytes');
  }
  const prepared = prepareBytes(bytes);
  if (prepared.utf16) {
    return utf16Result();
  }
  if (bytes.slice(0, BINARY_SNIFF_BYTES).includes(0)) {
    return binaryInputResult();
  }
  const text = stripByteOrderMark(prepared.decoded.text);
  return parseDecoded(text, prepared.decoded.invalid, bytes.byteLength, limits);
}

export function parseDiff(input: string | Uint8Array, options?: ParseOptions): ParseResult {
  try {
    return typeof input === 'string' ? parseString(input, options) : parseByteInput(input, options);
  } catch {
    return internalResult();
  }
}

export const parseUnifiedDiff = parseDiff;
