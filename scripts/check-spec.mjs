import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const bytes = readFileSync('docs/SPEC.md');
const blobHeader = Buffer.from(`blob ${bytes.byteLength}\0`);
const digest = createHash('sha1').update(blobHeader).update(bytes).digest('hex');
const expected = 'a06a45a0080ebd36d5a02b98e5f25f48e493e7ec';
if (digest !== expected) {
  throw new Error(`docs/SPEC.md changed: expected ${expected}, got ${digest}.`);
}
