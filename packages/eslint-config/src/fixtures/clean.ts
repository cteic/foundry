export const Colour = {
  Red: 'red',
  Blue: 'blue',
} as const;

export type Colour = (typeof Colour)[keyof typeof Colour];

export function first(items: readonly Colour[]): Colour | undefined {
  return items[0];
}
