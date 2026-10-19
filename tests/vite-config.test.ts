import { describe, expect, it } from 'vitest';
import { resolveServerConfig } from '../vite.config';

describe('resolveServerConfig', () => {
  it('uses the documented defaults', () => {
    expect(resolveServerConfig({})).toEqual({ host: '127.0.0.1', port: 4173 });
  });

  it('accepts a valid host and port override', () => {
    expect(resolveServerConfig({ HOST: '0.0.0.0', PORT: '8080' })).toEqual({
      host: '0.0.0.0',
      port: 8080,
    });
  });

  it('falls back for an invalid port', () => {
    expect(resolveServerConfig({ PORT: 'not-a-port' })).toEqual({ host: '127.0.0.1', port: 4173 });
    expect(resolveServerConfig({ PORT: '65536' })).toEqual({ host: '127.0.0.1', port: 4173 });
  });
});
