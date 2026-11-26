export function moveTo(x: number, y: number): string {
  return `M${String(x)},${String(y)}`;
}

export function lineTo(x: number, y: number): string {
  return `L${String(x)},${String(y)}`;
}

export function cubicBezier(
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  x: number,
  y: number
): string {
  return `C${String(cp1x)},${String(cp1y)},${String(cp2x)},${String(cp2y)},${String(x)},${String(y)}`;
}

export function horizontalTo(x: number): string {
  return `H${String(x)}`;
}

export function verticalTo(y: number): string {
  return `V${String(y)}`;
}

export function closePath(): string {
  return 'Z';
}
