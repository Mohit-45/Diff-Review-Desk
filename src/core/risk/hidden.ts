import { countWork } from './scanWork';

export type HiddenScanOptions = {
  readonly isPath?: boolean;
  readonly isNewFile?: boolean;
  readonly lineNumber?: number;
  readonly allowBenignExemptions?: boolean;
};

export type HiddenSpan = {
  readonly start: number;
  readonly end: number;
  readonly codePoint: number;
  readonly codePointText: string;
  readonly label: string;
};

type CodePointRange = readonly [number, number];

const EXPLICIT_RANGES: readonly CodePointRange[] = [
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0x200b, 0x200d],
  [0x2060, 0x2064],
  [0xfff9, 0xfffb],
  [0xe0000, 0xe007f],
  [0xe0100, 0xe01ef],
];

const OTHER_FORMAT_RANGES: readonly CodePointRange[] = [
  [0x0600, 0x0605],
  [0x061c, 0x061c],
  [0x06dd, 0x06dd],
  [0x070f, 0x070f],
  [0x200e, 0x200f],
  [0x2065, 0x2065],
  [0x206a, 0x206f],
  [0x0890, 0x0891],
  [0x08e2, 0x08e2],
  [0x110bd, 0x110bd],
  [0x110cd, 0x110cd],
  [0x13430, 0x1343f],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
];

const HIDDEN_POINTS = [
  0x00ad, 0x034f, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180e, 0x2800, 0x3164, 0xffa0, 0xfeff, 0x2028,
  0x2029, 0x0085,
] as const;

const hiddenSet = new Set<number>(HIDDEN_POINTS);

for (const [start, end] of [...EXPLICIT_RANGES, ...OTHER_FORMAT_RANGES]) {
  for (let codePoint = start; codePoint <= end; codePoint += 1) {
    hiddenSet.add(codePoint);
  }
}
for (let codePoint = 0; codePoint <= 0x1f; codePoint += 1) {
  if (codePoint !== 0x09 && codePoint !== 0x0a) {
    hiddenSet.add(codePoint);
  }
}
for (let codePoint = 0x7f; codePoint <= 0x9f; codePoint += 1) {
  hiddenSet.add(codePoint);
}

export const HIDDEN_SET: ReadonlySet<number> = hiddenSet;

export function isHiddenCodePoint(codePoint: number): boolean {
  return HIDDEN_SET.has(codePoint);
}

function isEmojiBase(codePoint: number): boolean {
  return (
    (codePoint >= 0x1f000 && codePoint <= 0x1faff) || (codePoint >= 0x2600 && codePoint <= 0x27bf)
  );
}

function isArabicHebrewIndic(codePoint: number): boolean {
  return (
    (codePoint >= 0x0590 && codePoint <= 0x08ff) ||
    (codePoint >= 0x0900 && codePoint <= 0x0dff) ||
    (codePoint >= 0xfb1d && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff)
  );
}

function previousCodePoint(text: string, start: number): number | null {
  if (start === 0) {
    return null;
  }
  const previousUnit = text.charCodeAt(start - 1);
  const previousStart = previousUnit >= 0xdc00 && previousUnit <= 0xdfff ? start - 2 : start - 1;
  return text.codePointAt(previousStart) ?? null;
}

function nextCodePoint(text: string, end: number): number | null {
  return text.codePointAt(end) ?? null;
}

type HiddenCandidate = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly codePoint: number;
};

function isLeadingBom(candidate: HiddenCandidate, options: HiddenScanOptions): boolean {
  return (
    candidate.codePoint === 0xfeff &&
    options.isNewFile === true &&
    options.lineNumber === 1 &&
    candidate.start === 0
  );
}

function isDirectionalMark(codePoint: number): boolean {
  return codePoint === 0x200e || codePoint === 0x200f;
}

/** ZWNJ/ZWJ next to an emoji or inside Arabic, Hebrew and Indic text is ordinary shaping. */
function isShapingJoiner(candidate: HiddenCandidate): boolean {
  if (candidate.codePoint !== 0x200c && candidate.codePoint !== 0x200d) {
    return false;
  }
  const neighbours = [
    previousCodePoint(candidate.text, candidate.start),
    nextCodePoint(candidate.text, candidate.end),
  ];
  return neighbours.some(
    (neighbour) => neighbour !== null && (isEmojiBase(neighbour) || isArabicHebrewIndic(neighbour)),
  );
}

function isEmojiVariationSelector(candidate: HiddenCandidate): boolean {
  const { codePoint } = candidate;
  const isVariationSelector =
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);
  if (!isVariationSelector) {
    return false;
  }
  const previous = previousCodePoint(candidate.text, candidate.start);
  return previous !== null && isEmojiBase(previous);
}

function isBenign(candidate: HiddenCandidate, options: HiddenScanOptions): boolean {
  if (options.isPath || options.allowBenignExemptions === false) {
    return false;
  }
  return (
    isLeadingBom(candidate, options) ||
    isDirectionalMark(candidate.codePoint) ||
    isShapingJoiner(candidate) ||
    isEmojiVariationSelector(candidate)
  );
}

const HIDDEN_LABELS: Readonly<Record<number, string>> = {
  0x202a: 'left-to-right embedding',
  0x202b: 'right-to-left embedding',
  0x202c: 'pop directional formatting',
  0x202d: 'left-to-right override',
  0x202e: 'right-to-left override',
  0x2066: 'left-to-right isolate',
  0x2067: 'right-to-left isolate',
  0x2068: 'first strong isolate',
  0x2069: 'pop directional isolate',
  0x200b: 'zero width space',
  0x200c: 'zero width non-joiner',
  0x200d: 'zero width joiner',
  0x2060: 'word joiner',
  0xfeff: 'byte order mark',
  0x2028: 'line separator',
  0x2029: 'paragraph separator',
};

export function hiddenLabel(codePoint: number): string {
  return HIDDEN_LABELS[codePoint] ?? 'hidden or control character';
}

export function codePointText(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * One pass over the text. `onSpan` returns true to stop early, so a caller that
 * only needs to know whether anything is hidden does not build a span per character.
 */
function scanHidden(
  text: string,
  options: HiddenScanOptions,
  onSpan: (span: HiddenSpan) => boolean,
): void {
  let steps = 0;
  for (let start = 0; start < text.length;) {
    steps += 1;
    const codePoint = text.codePointAt(start);
    if (codePoint === undefined) {
      break;
    }
    const end = start + (codePoint > 0xffff ? 2 : 1);
    if (
      isHiddenCodePoint(codePoint) &&
      !isBenign({ text, start, end, codePoint }, options) &&
      onSpan({
        start,
        end,
        codePoint,
        codePointText: codePointText(codePoint),
        label: hiddenLabel(codePoint),
      })
    ) {
      break;
    }
    start = end;
  }
  countWork(steps);
}

export function findHiddenSpans(
  text: string,
  options: HiddenScanOptions = {},
): readonly HiddenSpan[] {
  const spans: HiddenSpan[] = [];
  scanHidden(text, options, (span) => {
    spans.push(span);
    return false;
  });
  return spans;
}

export function hasHiddenSpan(text: string, options: HiddenScanOptions = {}): boolean {
  let found = false;
  scanHidden(text, options, () => {
    found = true;
    return true;
  });
  return found;
}
