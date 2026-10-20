import { addAssignmentSpans } from './assignmentSpans';
import type { SecretKind, SecretSpan } from './secretSpan';
import { addPemSpans, addWebhookSpans } from './blockSpans';
import { addBearerSpans, addCredentialSpans, addJwtSpans, addKnownTokenSpans } from './tokenSpans';

export type { SecretKind, SecretSpan };

/** Higher wins when two spans start at the same offset. */
const SPAN_PRIORITY: Readonly<Record<SecretKind, number>> = {
  pem: 7,
  assignment: 7,
  webhook: 5,
  'url-credentials': 5,
  'known-token': 4,
  'bearer-token': 4,
};

function mergeSpans(spans: readonly SecretSpan[]): readonly SecretSpan[] {
  const sorted = [...spans].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    const priority = SPAN_PRIORITY[right.kind] - SPAN_PRIORITY[left.kind];
    return priority === 0 ? right.end - left.end : priority;
  });
  const merged: SecretSpan[] = [];
  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && span.start < previous.end) {
      continue;
    }
    merged.push(span);
  }
  return merged;
}

export function findSecretSpans(text: string): readonly SecretSpan[] {
  const spans: SecretSpan[] = [];
  addKnownTokenSpans(text, spans);
  addJwtSpans(text, spans);
  addCredentialSpans(text, spans);
  addBearerSpans(text, spans);
  addWebhookSpans(text, spans);
  addPemSpans(text, spans);
  addAssignmentSpans(text, spans);
  return mergeSpans(spans);
}

export { HIDDEN_SET, findHiddenSpans, hiddenLabel, isHiddenCodePoint } from './hidden';
