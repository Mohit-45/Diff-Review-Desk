const STRUCTURAL_PREFIXES: readonly string[] = [
  'diff --git ',
  'diff --cc ',
  '--- ',
  '+++ ',
  '@@ ',
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
  'Binary files ',
];

function skipCodeRange(line: string, start: number, low: number, high: number): number {
  let index = start;
  while (index < line.length && line.charCodeAt(index) >= low && line.charCodeAt(index) <= high) {
    index += 1;
  }
  return index;
}

/** Skip CSI parameter bytes, intermediate bytes and the single final byte. */
function skipCsi(line: string, start: number): number {
  const afterParameters = skipCodeRange(line, start, 0x30, 0x3f);
  return skipCodeRange(line, afterParameters, 0x20, 0x2f) + 1;
}

/** Skip an OSC payload and its BEL or ESC-backslash terminator, if present. */
function skipOsc(line: string, start: number): number {
  let index = start;
  while (
    index < line.length &&
    line.charCodeAt(index) !== 0x07 &&
    line.charCodeAt(index) !== 0x1b
  ) {
    index += 1;
  }
  if (line.charCodeAt(index) === 0x1b && line[index + 1] === '\\') {
    return index + 2;
  }
  return line.charCodeAt(index) === 0x07 ? index + 1 : index;
}

export function hasStructuralEscape(line: string): boolean {
  if (line.length === 0 || line.charCodeAt(0) !== 0x1b) {
    return false;
  }
  let index = 1;
  if (line[index] === '[') {
    index = skipCsi(line, index + 1);
  } else if (line[index] === ']') {
    index = skipOsc(line, index + 1);
  }
  const remainder = line.slice(index);
  return STRUCTURAL_PREFIXES.some((prefix) => remainder.startsWith(prefix));
}

export function stripAnsi(source: string): string {
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
