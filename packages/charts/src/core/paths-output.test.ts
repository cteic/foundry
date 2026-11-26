import { describe, expect, it } from 'vitest';

import { generateAreaPath } from './area.js';
import { generateAskPath, generateBidPath, generateDepthLinePath } from './depth-chart.js';
import { linearLine, monotoneLine } from './line.js';

// Exact SVG path strings, recorded from the library before it moved to
// stricter compiler settings. Any change to these strings changes a chart.

const identity = (value: number): number => value;
const points = [
  { x: 0, y: 10 },
  { x: 10, y: 30 },
  { x: 20, y: 25 },
  { x: 30, y: 25 },
  { x: 40, y: 60 },
];
const monotonePath =
  'M0,10C3.3333333333333335,16.666666666666668,6.666666666666666,30,10,30' +
  'C13.333333333333334,30,16.666666666666668,25,20,25' +
  'C23.333333333333332,25,26.666666666666668,25,30,25' +
  'C33.333333333333336,25,36.666666666666664,48.33333333333333,40,60';

describe('linearLine', () => {
  it('draws a straight segment to each point', () => {
    expect(linearLine(points, identity, identity)).toBe('M0,10L10,30L20,25L30,25L40,60');
  });

  it('draws nothing for no points', () => {
    expect(linearLine([], identity, identity)).toBe('');
  });
});

describe('monotoneLine', () => {
  it('draws one cubic segment per pair of points', () => {
    expect(monotoneLine(points, identity, identity)).toBe(monotonePath);
  });

  it('falls back to a move for one point and a line for two', () => {
    expect(monotoneLine([{ x: 1, y: 2 }], identity, identity)).toBe('M1,2');
    expect(monotoneLine(points.slice(0, 2), identity, identity)).toBe('M0,10L10,30');
  });

  it('flattens the tangent where the data changes direction', () => {
    const steps = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 100 },
      { x: 3, y: 100 },
    ];
    expect(monotoneLine(steps, identity, identity)).toBe(
      'M0,0C0.3333333333333333,0,0.6666666666666667,0,1,0' +
        'C1.3333333333333333,0,1.6666666666666667,100,2,100' +
        'C2.3333333333333335,100,2.6666666666666665,100,3,100'
    );
  });

  it('scales the tangents down when they would overshoot', () => {
    const climb = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 10 },
    ];
    expect(monotoneLine(climb, identity, identity)).toBe(
      'M0,0C0.3333333333333333,0.19611613513818404,0.6666666666666667,0.01941932430907989,1,1' +
        'C1.3333333333333333,1.9805806756909201,1.6666666666666667,7,2,10'
    );
  });
});

describe('generateAreaPath', () => {
  it('closes the line down to the baseline and back to the first point', () => {
    expect(generateAreaPath(points, identity, identity, 100, 'monotone')).toBe(
      `${monotonePath}V100H0Z`
    );
  });
});

describe('depth chart paths', () => {
  const bids = [
    { price: 9, amount: 1, cumulativeAmount: 1 },
    { price: 8, amount: 2, cumulativeAmount: 3 },
    { price: 7, amount: 1, cumulativeAmount: 4 },
  ];
  const asks = [
    { price: 12, amount: 2, cumulativeAmount: 5 },
    { price: 11, amount: 1, cumulativeAmount: 1 },
  ];

  it('steps the bids out from the highest price', () => {
    expect(generateBidPath(bids, identity, identity, 50)).toBe('M9,50V1H9V3H8V4H7V50Z');
  });

  it('steps the asks out from the lowest price', () => {
    expect(generateAskPath(asks, identity, identity, 50)).toBe('M11,50V1H11V5H12V50Z');
  });

  it('outlines the steps without closing the shape', () => {
    const outline = [...asks, { price: 13, amount: 1, cumulativeAmount: 6 }];
    expect(generateDepthLinePath(outline, identity, identity, true)).toBe('M11,1H12V5H13V6');
  });
});
