import { useMemo } from 'react';
import { generateSparklinePath } from '../core/sparkline.js';
import { chartColors } from '../utils/color.js';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function Sparkline({
  data,
  width = 100,
  height = 32,
  color,
  strokeWidth = 1.5,
  className,
}: SparklineProps) {
  const first = data[0];
  const last = data.at(-1);
  const resolvedColor =
    color ??
    (data.length >= 2 && first !== undefined && last !== undefined && last >= first
      ? chartColors.bid
      : chartColors.ask);

  const path = useMemo(() => generateSparklinePath(data, width, height), [data, width, height]);

  if (!path) return null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      <path
        d={path}
        fill="none"
        stroke={resolvedColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
