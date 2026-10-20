import { describe, expect, it } from 'vitest';
import { parsedFiles, smallDiff } from '../app/appFixtures';
import { groupThrownRules } from './ruleNotices';

const { files } = parsedFiles(smallDiff());
const [first, second] = files;
const firstId = first?.id ?? '';
const secondId = second?.id ?? '';

describe('RV-RULE-THROWS groupThrownRules', () => {
  it('lists one entry per rule with the first file and the number of files', () => {
    const groups = groupThrownRules(
      [
        { ruleId: 'hidden-unicode', fileId: firstId, message: 'quotes the diff' },
        { ruleId: 'hidden-unicode', fileId: secondId, message: 'quotes the diff' },
        { ruleId: 'hidden-unicode', fileId: secondId, message: 'quotes the diff' },
        { ruleId: 'file-deleted', fileId: secondId, message: 'quotes the diff' },
      ],
      files,
    );
    expect(groups).toEqual([
      { ruleId: 'hidden-unicode', path: 'src/a.ts', files: 2 },
      { ruleId: 'file-deleted', path: 'src/c.ts', files: 1 },
    ]);
  });

  it('never carries the engine message', () => {
    const groups = groupThrownRules(
      [{ ruleId: 'hidden-unicode', fileId: firstId, message: 'secret text from the diff' }],
      files,
    );
    expect(JSON.stringify(groups)).not.toContain('secret text');
  });

  it('ignores a notice that names no rule, such as a line over the scan limit', () => {
    expect(
      groupThrownRules(
        [{ ruleId: null, fileId: firstId, message: 'A line exceeds the limit.' }],
        files,
      ),
    ).toEqual([]);
  });

  it('gives an empty path for a file the diff does not have', () => {
    expect(
      groupThrownRules([{ ruleId: 'hidden-unicode', fileId: 'f-missing', message: '' }], files),
    ).toEqual([{ ruleId: 'hidden-unicode', path: '', files: 1 }]);
  });
});
