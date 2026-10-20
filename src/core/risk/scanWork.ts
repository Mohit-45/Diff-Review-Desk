// A work counter for the span scanners, so tests can assert linear cost in
// characters examined rather than in wall-clock time.

const counter = { steps: 0 };

/** Record `steps` characters examined by a scanner. */
export function countWork(steps: number): void {
  counter.steps += steps;
}

export function readScanWork(): number {
  return counter.steps;
}

export function resetScanWork(): void {
  counter.steps = 0;
}
