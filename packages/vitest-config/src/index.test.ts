import { describe, expect, it } from 'vitest';

import { createVitestConfig, defaultInclude } from './index.js';

describe('createVitestConfig', () => {
  it('uses node, the default include and v8 coverage with no floor', () => {
    const { test } = createVitestConfig();

    expect(test?.environment).toBe('node');
    expect(test?.include).toEqual(defaultInclude);
    expect(test?.restoreMocks).toBe(true);
    expect(test?.coverage).toMatchObject({ provider: 'v8' });
    expect(test?.coverage).not.toHaveProperty('thresholds');
  });

  it('applies a coverage floor and include list', () => {
    const floor = { statements: 50, branches: 80, functions: 65, lines: 50 };
    const { test } = createVitestConfig({
      coverageInclude: ['src/**'],
      coverageFloor: floor,
    });

    expect(test?.coverage).toMatchObject({ include: ['src/**'], thresholds: floor });
  });
});
