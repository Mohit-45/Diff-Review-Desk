import type { FrameScheduler } from './frame';

/** Runs the parse at once, for tests that are not about the frame before it. */
export const immediateFrame: FrameScheduler = (callback) => {
  callback();
};

/** Holds every scheduled callback until the test says the frame has been painted. */
export function manualFrames(): { readonly schedule: FrameScheduler; readonly paint: () => void } {
  const waiting: (() => void)[] = [];
  return {
    schedule: (callback) => {
      waiting.push(callback);
    },
    paint: () => {
      for (const callback of waiting.splice(0)) callback();
    },
  };
}
