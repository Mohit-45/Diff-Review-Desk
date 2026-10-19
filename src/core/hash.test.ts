import { describe, expect, it } from 'vitest';
import { h } from './hash';

describe('hash vectors', () => {
  it('returns a stable eleven-character base36 identifier', () => {
    expect(h('')).toHaveLength(11);
    expect(h('')).toBe(h(''));
    expect(h('diff-review')).toMatch(/^[0-9a-z]{11}$/);
  });

  it('keeps NUL and Unicode input deterministic', () => {
    expect(h('h1\0+astral-😀')).toBe(h('h1\0+astral-😀'));
    expect(h('h1\0+astral-😀')).not.toBe(h('h1\0+astral-😃'));
  });
});
