export type StorageAreaLike = {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
};

export class MemoryStorageArea implements StorageAreaLike {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
}

/** Environments differ (workers, SSR, privacy modes), so the global is checked, not trusted. */
export function isStorageAreaLike(candidate: unknown): candidate is StorageAreaLike {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'getItem' in candidate &&
    typeof candidate.getItem === 'function' &&
    'setItem' in candidate &&
    typeof candidate.setItem === 'function' &&
    'removeItem' in candidate &&
    typeof candidate.removeItem === 'function' &&
    'key' in candidate &&
    typeof candidate.key === 'function'
  );
}

export function browserArea(name: 'localStorage' | 'sessionStorage'): StorageAreaLike | null {
  try {
    const candidate: unknown = globalThis[name];
    return isStorageAreaLike(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function readKeys(area: StorageAreaLike, prefix: string): readonly string[] {
  const keys: string[] = [];
  for (let index = 0; index < area.length; index += 1) {
    const key = area.key(index);
    if (key !== null && key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  return keys;
}
