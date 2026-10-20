import type { Prefs } from '../core/types';
import { PREFS_KEY, THEME_KEY } from './keys';
import type { StorageState } from './state';
import { errorResult, plainError, success, type StorageRead } from './storageErrors';
import { DEFAULT_PREFS, isThemeName, parsePrefs, serializePrefs } from './validator';
import { writeWithRecovery } from './writes';

export function readPrefs(state: StorageState): StorageRead<Prefs> {
  return state.read<Prefs>(() => {
    const raw = state.area('local').getItem(PREFS_KEY);
    if (raw === null) {
      return success({ ...DEFAULT_PREFS });
    }
    const parsed = parsePrefs(raw);
    if (parsed.ok) {
      return success(parsed.value);
    }
    state.addNotice({
      code: 'corrupt',
      key: PREFS_KEY,
      message: 'Saved preferences were corrupt and were reset.',
    });
    return success({ ...DEFAULT_PREFS });
  }, 'Saved preferences could not be read.');
}

export function savePrefs(state: StorageState, prefs: Prefs): StorageRead<void> {
  const serialized = serializePrefs(prefs);
  if (!serialized.ok) {
    return errorResult(plainError('unavailable', 'Preferences could not be saved.'));
  }
  return writeWithRecovery(state, {
    area: 'local',
    key: PREFS_KEY,
    value: serialized.value,
    openFingerprint: null,
  });
}

export function readTheme(state: StorageState): StorageRead<Prefs['theme']> {
  return state.read<Prefs['theme']>(() => {
    const raw = state.area('local').getItem(THEME_KEY);
    return success(isThemeName(raw) ? raw : 'system');
  }, 'Saved theme could not be read.');
}

/** Takes unknown on purpose: the check guards a value that got past the compile-time type. */
export function saveTheme(state: StorageState, theme: unknown): StorageRead<void> {
  if (!isThemeName(theme)) {
    return errorResult(plainError('unavailable', 'The selected theme is invalid.'));
  }
  return writeWithRecovery(state, {
    area: 'local',
    key: THEME_KEY,
    value: theme,
    openFingerprint: null,
  });
}
