import { LIMITS } from '../core/limits';
import { fail, ok } from '../core/result';
import type { DecoderInput, ParseError, Result } from '../core/types';

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

function parseError(
  code: ParseError['code'],
  title: string,
  detail: string,
  hint: ParseError['hint'],
  suggestion: string | null,
): ParseError {
  return { code, title, detail, hint, suggestion };
}

function bytesForText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function hasUtf16Signature(bytes: Uint8Array): boolean {
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    return true;
  }
  const length = Math.min(64, bytes.length);
  if (length < 2) {
    return false;
  }
  let ascii = true;
  let alternatingNul = true;
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) {
      break;
    }
    if (byte !== 0 && (byte < 0x09 || byte > 0x7e)) {
      ascii = false;
      break;
    }
    if (index % 2 === 0 ? byte === 0 : byte !== 0) {
      alternatingNul = false;
    }
  }
  if (ascii && alternatingNul) {
    return true;
  }
  ascii = true;
  alternatingNul = true;
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) {
      break;
    }
    if (byte !== 0 && (byte < 0x09 || byte > 0x7e)) {
      ascii = false;
      break;
    }
    if (index % 2 === 1 ? byte === 0 : byte !== 0) {
      alternatingNul = false;
    }
  }
  return ascii && alternatingNul;
}

function hasNulInPrefix(bytes: Uint8Array, count: number): boolean {
  const length = Math.min(bytes.length, count);
  for (let index = 0; index < length; index += 1) {
    if (bytes[index] === 0) {
      return true;
    }
  }
  return false;
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

function stripAnsiOnStructuralLines(text: string): {
  readonly text: string;
  readonly count: number;
} {
  const ansi = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/gu;
  const structural =
    /^(?:diff --(?:git|cc) |(?:---|\+\+\+|@@|@@@ |index |old mode |new mode |new file mode |deleted file mode |similarity index |rename |copy |Binary files |GIT binary patch))/u;
  let count = 0;
  const lines = text.split('\n').map((line) => {
    if (!line.startsWith('\u001b')) {
      return line;
    }
    const stripped = line.replace(ansi, '');
    if (stripped !== line && structural.test(stripped)) {
      count += 1;
      return stripped;
    }
    return line;
  });
  return { text: lines.join('\n'), count };
}

function decodeBytes(bytes: Uint8Array): Result<DecodedDiff, ParseError> {
  if (bytes.length > LIMITS.maxInputBytes) {
    return fail(
      parseError(
        'too-large',
        'This diff is too large',
        `The input is ${bytes.length} bytes; the limit is ${LIMITS.maxInputBytes} bytes.`,
        'generic',
        'Review a narrower change with `git diff -- src/`.',
      ),
    );
  }
  if (hasUtf16Signature(bytes)) {
    return fail(
      parseError(
        'not-a-diff',
        'This looks like UTF-16 text',
        'PowerShell `>` writes UTF-16. Re-run with `| Out-File -Encoding utf8`, or paste the text.',
        'utf16',
        'Re-run the command with UTF-8 output, or paste the text directly.',
      ),
    );
  }
  if (hasNulInPrefix(bytes, 8_000)) {
    return fail(
      parseError(
        'binary-input',
        'This looks like a binary file, not text',
        'A NUL byte appeared near the start of the input.',
        'generic',
        'Choose a text diff or run `git diff --no-ext-diff --no-color`.',
      ),
    );
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

function finishDecode(
  input: string,
  inputBytes: number,
  initialWarnings: readonly DecodeWarning[],
): Result<DecodedDiff, ParseError> {
  if (inputBytes > LIMITS.maxInputBytes) {
    return fail(
      parseError(
        'too-large',
        'This diff is too large',
        `The input is ${inputBytes} bytes; the limit is ${LIMITS.maxInputBytes} bytes.`,
        'generic',
        'Review a narrower change with `git diff -- src/`.',
      ),
    );
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
    return fail(
      parseError(
        'empty',
        'Nothing to review',
        'The diff is empty or contains only whitespace.',
        null,
        'Paste a unified diff or try a sample.',
      ),
    );
  }
  return ok({ text, inputBytes, warnings });
}

export function decode(input: DecoderInput | string | Uint8Array): Result<DecodedDiff, ParseError> {
  if (typeof input === 'string') {
    const bytes = bytesForText(input);
    if (hasNulInPrefix(bytes, 8_000)) {
      return fail(
        parseError(
          'binary-input',
          'This looks like a binary file, not text',
          'A NUL byte appeared near the start of the input.',
          'generic',
          'Choose a text diff or run `git diff --no-ext-diff --no-color`.',
        ),
      );
    }
    return finishDecode(input, bytes.length, []);
  }
  if (input instanceof Uint8Array) {
    return decodeBytes(input);
  }
  if (input.kind === 'text') {
    const bytes = bytesForText(input.text);
    if (hasNulInPrefix(bytes, 8_000)) {
      return fail(
        parseError(
          'binary-input',
          'This looks like a binary file, not text',
          'A NUL byte appeared near the start of the input.',
          'generic',
          'Choose a text diff or run `git diff --no-ext-diff --no-color`.',
        ),
      );
    }
    return finishDecode(input.text, bytes.length, []);
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
      return fail(
        parseError(
          'empty',
          'Nothing to review',
          'The selected file is empty.',
          null,
          'Choose a diff file or paste the diff text.',
        ),
      );
    }
    if (file.size > LIMITS.maxInputBytes) {
      return fail(
        parseError(
          'too-large',
          'This diff is too large',
          `The input is ${file.size} bytes; the limit is ${LIMITS.maxInputBytes} bytes.`,
          'generic',
          'Review a narrower change with `git diff -- src/`.',
        ),
      );
    }
    const buffer = await file.arrayBuffer();
    return decodeBytes(new Uint8Array(buffer));
  } catch {
    return fail(
      parseError(
        'internal',
        `Could not read ${file.name ?? 'this file'}`,
        `The file ${file.name ?? 'could not be read'} could not be read from this browser.`,
        'generic',
        'Choose the file again or paste the diff text. Retry.',
      ),
    );
  }
}
