/** Where an arrow key, Home or End leads from the item at `index`; null for any other key. */
export function rovingTarget(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowDown':
      return Math.min(index + 1, count - 1);
    case 'ArrowUp':
      return Math.max(index - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
