import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paintedFrame } from './frame';
import { manualFrames } from './frameFixtures';

describe('IN-READING the painted frame before a parse', () => {
  let frames: FrameRequestCallback[] = [];
  const realFrame: unknown = Reflect.get(globalThis, 'requestAnimationFrame');

  beforeEach(() => {
    frames = [];
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.set(globalThis, 'requestAnimationFrame', realFrame);
  });

  it('waits for an animation frame and then a timer, so the paint has happened', () => {
    const run = vi.fn();
    paintedFrame(run);
    vi.advanceTimersByTime(100);
    expect(run).not.toHaveBeenCalled();
    frames[0]?.(0);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not wait for ever in a background tab that never fires frames', () => {
    const run = vi.fn();
    paintedFrame(run);
    vi.advanceTimersByTime(249);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    frames[0]?.(0);
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('falls back to a timer where there is no requestAnimationFrame', () => {
    Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    const run = vi.fn();
    paintedFrame(run);
    vi.advanceTimersByTime(0);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('the frame fixtures', () => {
  it('holds callbacks until the test paints, and runs each once', () => {
    const { schedule, paint } = manualFrames();
    const run = vi.fn();
    schedule(run);
    expect(run).not.toHaveBeenCalled();
    paint();
    paint();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
