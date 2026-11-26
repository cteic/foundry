# @cteic/charts

SVG charts with no runtime dependencies. The library has two layers:

| Entry point           | What it gives you                                                                               | Needs React   |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------- |
| `@cteic/charts/core`  | Scales, ticks and SVG path strings: linear and monotone lines, areas, depth steps, sparklines   | No            |
| `@cteic/charts/react` | Components built on the core: `PriceChart`, `LineChart`, `AreaChart`, `DepthChart`, `Sparkline` | Yes, 18 or 19 |

Monotone lines use Fritsch-Carlson interpolation, so a curve never overshoots its data. A price line through 10, 30 and 25 never draws a peak above 30.

## Install

```sh
pnpm add @cteic/charts
```

## Draw a path without React

```ts
import { createLinearScale, generateLinePath } from '@cteic/charts/core';

const points = [
  { x: 0, y: 10 },
  { x: 1, y: 30 },
  { x: 2, y: 25 },
];
const scaleX = createLinearScale({ domain: [0, 2], range: [0, 300] });
const scaleY = createLinearScale({ domain: [0, 40], range: [120, 0] });

// An SVG `d` attribute: use it in a <path>, on a canvas with Path2D, or on the server.
const d = generateLinePath(points, scaleX, scaleY, 'monotone');
```

## Render a chart in React

```tsx
import { PriceChart, Sparkline } from '@cteic/charts/react';

export function BitcoinCard({ history }: { history: { x: number; y: number }[] }) {
  return (
    <>
      <PriceChart data={history} height={240} />
      <Sparkline data={history.map((point) => point.y)} width={100} height={32} />
    </>
  );
}
```

`PriceChart` fills its container's width and shows a crosshair and tooltip on hover. Colours default to `chartColors` and every component takes a `className`.
