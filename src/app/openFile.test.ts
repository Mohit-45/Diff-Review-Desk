import { describe, expect, it } from 'vitest';
import { LIMITS } from '../core/limits';
import { memoryAreas, smallDiff } from './appFixtures';
import { openFile, type FileSource } from './openFile';

function fileOf(bytes: Uint8Array, name: string, size = bytes.length): FileSource {
  return {
    name,
    size,
    arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
  };
}

const encoder = new TextEncoder();

describe('openFile', () => {
  it('labels the review with the file name', async () => {
    const { adapter } = memoryAreas();
    const opened = await openFile(fileOf(encoder.encode(smallDiff()), 'agent.patch'), { adapter });
    expect(opened.ok && opened.value.state.label).toBe('agent.patch');
  });

  it('falls back to the paths when the file has no name', async () => {
    const { adapter } = memoryAreas();
    const opened = await openFile(fileOf(encoder.encode(smallDiff()), ''), { adapter });
    expect(opened.ok && opened.value.state.label).toBe('src/a.ts and 1 more');
  });

  it('IN-ZERO-BYTE rejects an empty file before reading it', async () => {
    const { adapter } = memoryAreas();
    let read = false;
    const file: FileSource = {
      name: 'empty.diff',
      size: 0,
      arrayBuffer: () => {
        read = true;
        return Promise.resolve(new ArrayBuffer(0));
      },
    };
    const opened = await openFile(file, { adapter });
    expect(!opened.ok && 'code' in opened.error && opened.error.code).toBe('empty');
    expect(read).toBe(false);
  });

  it('IN-OVERLIMIT-FILE rejects from file.size without reading', async () => {
    const { adapter } = memoryAreas();
    let read = false;
    const file: FileSource = {
      name: 'huge.diff',
      size: LIMITS.maxInputBytes + 1,
      arrayBuffer: () => {
        read = true;
        return Promise.resolve(new ArrayBuffer(0));
      },
    };
    const opened = await openFile(file, { adapter });
    expect(!opened.ok && 'code' in opened.error && opened.error.code).toBe('too-large');
    expect(read).toBe(false);
  });

  it('IN-READ-FAIL reports the file name when the read rejects', async () => {
    const { adapter } = memoryAreas();
    const file: FileSource = {
      name: 'broken.diff',
      size: 10,
      arrayBuffer: () => Promise.reject(new Error('disk')),
    };
    const opened = await openFile(file, { adapter });
    expect(!opened.ok && 'title' in opened.error && opened.error.title).toBe(
      'Could not read broken.diff',
    );
  });

  it('decodes a UTF-16 file as the not-a-diff UTF-16 error', async () => {
    const { adapter } = memoryAreas();
    const text = smallDiff();
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let index = 0; index < text.length; index += 1) {
      bytes[2 + index * 2] = text.charCodeAt(index);
    }
    const opened = await openFile(fileOf(bytes, 'ps.diff'), { adapter });
    expect(!opened.ok && 'hint' in opened.error && opened.error.hint).toBe('utf16');
  });

  it('strips a UTF-8 BOM before parsing', async () => {
    const { adapter } = memoryAreas();
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const body = encoder.encode(smallDiff());
    const bytes = new Uint8Array(bom.length + body.length);
    bytes.set(bom);
    bytes.set(body, bom.length);
    const opened = await openFile(fileOf(bytes, 'bom.diff'), { adapter });
    expect(opened.ok).toBe(true);
  });
});
