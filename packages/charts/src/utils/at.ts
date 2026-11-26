/**
 * Read an element the caller has already bounds-checked.
 *
 * Every caller indexes inside a loop or after a length check, so the throw
 * cannot fire on valid input. It replaces a non-null assertion: a bad index
 * fails loudly instead of feeding `undefined` into path maths as `NaN`.
 */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`index ${String(index)} is outside a list of ${String(items.length)}`);
  }
  return item;
}
