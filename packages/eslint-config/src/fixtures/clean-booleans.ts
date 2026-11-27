export function visible(count: number, { open }: { open: boolean }): boolean {
  const isReady = count > 2;
  const IS_STRICT = process.env.STRICT === '1';
  return isReady && IS_STRICT && open;
}

export function points({ total_points }: { total_points: number }): number {
  return total_points;
}

export function finished(result: { done: boolean; value: number }): boolean {
  const { done, value } = result;
  return done && value > 0;
}
