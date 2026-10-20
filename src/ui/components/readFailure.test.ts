import { describe, expect, it } from 'vitest';
import type { ParseError } from '../../core/types';
import { unreadableFileError } from '../../app/decodeErrors';
import { LOAD_FAILED } from '../messages/app';
import { emptyError, isReadFailure } from './intakeValidation';

describe('IN-READ-FAIL which errors offer Retry', () => {
  it('is true for a file whose bytes could not be read, named or not', () => {
    expect(isReadFailure(unreadableFileError('broken.diff'))).toBe(true);
    expect(isReadFailure(unreadableFileError(undefined))).toBe(true);
  });

  it('is false for every other error', () => {
    const notAnError: ParseError = { ...emptyError(), title: 'Could not read it' };
    expect(isReadFailure(emptyError())).toBe(false);
    expect(isReadFailure(LOAD_FAILED)).toBe(false);
    expect(isReadFailure(notAnError)).toBe(false);
  });
});
