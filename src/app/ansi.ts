// The escape and bell characters are named constants and the sequences are scanned by hand
// because a regular expression cannot carry control characters without tripping
// no-control-regex.
const ESC = '\u001B';
const BEL = '\u0007';
const STRING_TERMINATOR = `${ESC}\\`;

const STRUCTURAL_LINE =
  /^(?:diff --(?:git|cc) |(?:---|\+\+\+|@@|@@@ |index |old mode |new mode |new file mode |deleted file mode |similarity index |rename |copy |Binary files |GIT binary patch))/u;

type OscTerminators = {
  /** Index of the last BEL in the line, or -1. */
  readonly lastBel: number;
  /** Index of the last ESC backslash in the line, or -1. */
  readonly lastStringTerminator: number;
};

function inRange(line: string, index: number, low: number, high: number): boolean {
  const code = line.charCodeAt(index);
  return code >= low && code <= high;
}

/** CSI: ESC [ parameter bytes, intermediate bytes, one final byte. Returns the end or -1. */
function csiEnd(line: string, escIndex: number): number {
  let index = escIndex + 2;
  while (inRange(line, index, 0x30, 0x3f)) {
    index += 1;
  }
  while (inRange(line, index, 0x20, 0x2f)) {
    index += 1;
  }
  return inRange(line, index, 0x40, 0x7e) ? index + 1 : -1;
}

/**
 * OSC: ESC ] then anything up to the first BEL. With no BEL left, the sequence reaches the last
 * ESC backslash instead. The two lookups are precomputed so a line of repeated "ESC ]" stays linear.
 */
function oscEnd(line: string, escIndex: number, terminators: OscTerminators): number {
  const bodyStart = escIndex + 2;
  if (terminators.lastBel >= bodyStart) {
    return line.indexOf(BEL, bodyStart) + 1;
  }
  return terminators.lastStringTerminator >= bodyStart ? terminators.lastStringTerminator + 2 : -1;
}

function sequenceEnd(line: string, escIndex: number, terminators: OscTerminators): number {
  const introducer = line[escIndex + 1];
  if (introducer === '[') {
    return csiEnd(line, escIndex);
  }
  return introducer === ']' ? oscEnd(line, escIndex, terminators) : -1;
}

/** Removes every CSI and OSC sequence from one line. */
export function stripAnsiSequences(line: string): string {
  const terminators: OscTerminators = {
    lastBel: line.lastIndexOf(BEL),
    lastStringTerminator: line.lastIndexOf(STRING_TERMINATOR),
  };
  const kept: string[] = [];
  let keepFrom = 0;
  let escIndex = line.indexOf(ESC);
  while (escIndex !== -1) {
    const end = sequenceEnd(line, escIndex, terminators);
    if (end === -1) {
      escIndex = line.indexOf(ESC, escIndex + 1);
      continue;
    }
    kept.push(line.slice(keepFrom, escIndex));
    keepFrom = end;
    escIndex = line.indexOf(ESC, end);
  }
  kept.push(line.slice(keepFrom));
  return kept.join('');
}

/** Strips colour from lines that begin with an escape and become a structural diff line. */
export function stripAnsiOnStructuralLines(text: string): {
  readonly text: string;
  readonly count: number;
} {
  let count = 0;
  const lines = text.split('\n').map((line) => {
    if (!line.startsWith(ESC)) {
      return line;
    }
    const stripped = stripAnsiSequences(line);
    if (stripped !== line && STRUCTURAL_LINE.test(stripped)) {
      count += 1;
      return stripped;
    }
    return line;
  });
  return { text: lines.join('\n'), count };
}
