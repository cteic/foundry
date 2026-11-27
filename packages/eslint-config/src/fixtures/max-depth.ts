export function deepest(values: readonly number[]): number {
  let found = 0;
  for (const first of values) {
    for (const second of values) {
      for (const third of values) {
        if (first + second + third > found) {
          found = first + second + third;
        }
      }
    }
  }
  return found;
}
