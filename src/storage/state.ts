import { MemoryStorageArea, type StorageAreaLike } from './areas';
import { PREFS_KEY } from './keys';
import { DEGRADED_MESSAGE, MEMORY_MESSAGE, type StorageNotice } from './notices';
import { errorResult, isStorageError, plainError, type StorageRead } from './storageErrors';

export type StorageMode = 'persistent' | 'memory';
export type AreaName = 'local' | 'session';
export type MemoryReason = 'degraded' | 'quota';

export type StateConfig = {
  readonly local: StorageAreaLike | null;
  readonly session: StorageAreaLike | null;
  readonly maxRecords: number;
};

function canRead(area: StorageAreaLike): boolean {
  try {
    area.getItem(PREFS_KEY);
    return true;
  } catch {
    return false;
  }
}

function copyInto(area: StorageAreaLike, target: MemoryStorageArea): boolean {
  try {
    for (let index = 0; index < area.length; index += 1) {
      const key = area.key(index);
      if (key === null) {
        continue;
      }
      const value = area.getItem(key);
      if (value !== null) {
        target.setItem(key, value);
      }
    }
    return true;
  } catch {
    return false;
  }
}

function lengthOf(area: StorageAreaLike): number | null {
  try {
    return area.length;
  } catch {
    return null;
  }
}

/**
 * The live areas, the memory copies that back them once the browser refuses access, and the
 * notices raised along the way. Every storage module works through this one object.
 */
export class StorageState {
  readonly maxRecords: number;
  private readonly memoryLocal = new MemoryStorageArea();
  private readonly memorySession = new MemoryStorageArea();
  private localArea: StorageAreaLike = this.memoryLocal;
  private sessionArea: StorageAreaLike = this.memorySession;
  private currentMode: StorageMode = 'memory';
  private noticeList: readonly StorageNotice[] = [];

  constructor(config: StateConfig) {
    this.maxRecords = config.maxRecords;
    const { local, session } = config;
    if (local !== null && session !== null && canRead(local) && canRead(session)) {
      this.attach(local, session);
    }
    if (this.currentMode === 'memory') {
      this.addNotice({ code: 'degraded', key: null, message: DEGRADED_MESSAGE });
    }
  }

  get mode(): StorageMode {
    return this.currentMode;
  }

  /** Always tracks memory mode, so it is derived rather than stored. */
  get degraded(): boolean {
    return this.currentMode === 'memory';
  }

  get notices(): readonly StorageNotice[] {
    return this.noticeList;
  }

  area(name: AreaName): StorageAreaLike {
    return name === 'local' ? this.localArea : this.sessionArea;
  }

  memoryArea(name: AreaName): MemoryStorageArea {
    return name === 'local' ? this.memoryLocal : this.memorySession;
  }

  addNotice(notice: StorageNotice): void {
    const known = this.noticeList.some(
      (existing) => existing.code === notice.code && existing.key === notice.key,
    );
    if (!known) {
      this.noticeList = [...this.noticeList, notice];
    }
  }

  setMemoryMode(reason: MemoryReason = 'degraded'): void {
    if (this.currentMode === 'memory') {
      if (reason !== 'degraded') {
        this.addNotice({
          code: reason,
          key: null,
          message: MEMORY_MESSAGE,
        });
      }
      return;
    }
    this.currentMode = 'memory';
    this.localArea = this.memoryLocal;
    this.sessionArea = this.memorySession;
    this.addNotice({ code: reason, key: null, message: DEGRADED_MESSAGE });
  }

  /**
   * Runs a read. A SecurityError switches to the memory copies and reads again; any other failure
   * becomes a plain "unavailable" result carrying `unavailableDetail`.
   */
  read<T>(operation: () => StorageRead<T>, unavailableDetail: string): StorageRead<T> {
    try {
      return operation();
    } catch (caught: unknown) {
      if (isStorageError(caught)) {
        this.setMemoryMode();
        return this.read(operation, unavailableDetail);
      }
      return errorResult(plainError('unavailable', unavailableDetail));
    }
  }

  private attach(local: StorageAreaLike, session: StorageAreaLike): void {
    const localCopied = copyInto(local, this.memoryLocal);
    const sessionCopied = copyInto(session, this.memorySession);
    if (localCopied && sessionCopied) {
      this.localArea = local;
      this.sessionArea = session;
      this.currentMode = 'persistent';
    }
    if (lengthOf(this.localArea) === null || lengthOf(this.sessionArea) === null) {
      this.setMemoryMode();
    }
  }
}
