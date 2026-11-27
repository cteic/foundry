export function check(count: number): number {
  const ready = count > 2;
  return ready ? count : 0;
}
