import { countWork } from './scanWork';
import { lowerKeepingOffsets, makeFinder, makeRunEnd, type SecretSpan } from './secretSpan';

const WEBHOOK_MARKERS = [
  'https://hooks.slack.com/services/',
  'https://discord.com/api/webhooks/',
] as const;

function isWebhookEnd(character: string | undefined): boolean {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '"' ||
    character === "'" ||
    character === ')' ||
    character === ']' ||
    character === '}' ||
    character === ','
  );
}

function webhookEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && !isWebhookEnd(text[end])) {
    end += 1;
  }
  countWork(end - start + 1);
  return end;
}

export function addWebhookSpans(text: string, spans: SecretSpan[]): void {
  const lower = lowerKeepingOffsets(text);
  for (const marker of WEBHOOK_MARKERS) {
    const find = makeFinder(lower, marker);
    // Markers inside one URL share its terminator, so the URL is scanned once.
    const runEnd = makeRunEnd(text, webhookEnd);
    let index = find(0);
    while (index >= 0) {
      const end = runEnd(index + marker.length);
      if (end > index + marker.length) {
        spans.push({
          start: index,
          end,
          kind: 'webhook',
          ruleId: 'secret-known-token',
          publicPrefix: null,
        });
      }
      index = find(index + marker.length);
    }
  }
}

const PEM_BEGIN = '-----BEGIN ';
const PEM_END = '-----END ';
const PEM_DASHES = '-----';
const PEM_KEY = 'PRIVATE KEY';

/**
 * Where a PEM block whose header ended at `headerEnd` stops: after its closing
 * `-----END … PRIVATE KEY-----` line, or the end of the text when it never closes.
 * Header ends arrive in order, so each lookup below is answered from memory.
 */
function makePemCloser(text: string): (headerEnd: number) => number {
  const findEnd = makeFinder(text, PEM_END);
  const findDashes = makeFinder(text, PEM_DASHES);
  const findKey = makeFinder(text, PEM_KEY);
  return (headerEnd) => {
    const endStart = findEnd(headerEnd);
    const markerEnd = endStart < 0 ? -1 : findDashes(endStart + PEM_END.length);
    if (markerEnd < 0) {
      return text.length;
    }
    const key = findKey(endStart);
    return key >= 0 && key + PEM_KEY.length <= markerEnd
      ? markerEnd + PEM_DASHES.length
      : text.length;
  };
}

function isPrivateKeyHeader(header: string): boolean {
  return (
    header.includes(PEM_KEY) && !header.includes('CERTIFICATE') && !header.includes('PUBLIC KEY')
  );
}

export function addPemSpans(text: string, spans: SecretSpan[]): void {
  const findBegin = makeFinder(text, PEM_BEGIN);
  const findHeaderEnd = makeFinder(text, PEM_DASHES);
  const closeAt = makePemCloser(text);
  let index = findBegin(0);
  while (index >= 0) {
    const headerEnd = findHeaderEnd(index + PEM_BEGIN.length);
    // A header stops at the next dash run, which is no later than the next BEGIN.
    if (headerEnd >= 0 && isPrivateKeyHeader(text.slice(index, headerEnd))) {
      spans.push({
        start: index,
        end: closeAt(headerEnd),
        kind: 'pem',
        ruleId: 'secret-known-token',
        publicPrefix: null,
      });
    }
    index = findBegin(index + 1);
  }
}
