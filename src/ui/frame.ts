/** Runs a callback once the page has had a chance to paint. The UI layer owns time and frames. */
export type FrameScheduler = (callback: () => void) => void;

/** A background tab never fires animation frames, and a load must not wait for one forever. */
const HIDDEN_TAB_FALLBACK_MS = 250;

/**
 * One painted frame: animation frames fire before the paint they belong to, so the callback
 * waits for the timer queued from inside one. The parse that follows is synchronous and blocks
 * the page, so what was on screen when it started is what the user sees until it ends.
 */
export const paintedFrame: FrameScheduler = (callback) => {
  let ran = false;
  const fallback = setTimeout(() => {
    run();
  }, HIDDEN_TAB_FALLBACK_MS);
  function run(): void {
    if (ran) return;
    ran = true;
    clearTimeout(fallback);
    callback();
  }
  if ('requestAnimationFrame' in globalThis) {
    requestAnimationFrame(() => {
      setTimeout(run, 0);
    });
  } else {
    setTimeout(run, 0);
  }
};
