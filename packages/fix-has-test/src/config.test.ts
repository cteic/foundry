import { describe, expect, it } from 'vitest';

import { emptyConfig, parseConfig, resolveOptions, splitList, UsageError } from './config.ts';

describe('parseConfig', () => {
  it('reads every known key', () => {
    const config = {
      base: 'origin/dev',
      types: ['fix', 'perf'],
      testGlobs: ['*_test.go'],
      exemptScopes: [],
    };

    expect(parseConfig(config, '.fix-has-test.json')).toEqual(config);
  });

  it('leaves missing keys undefined', () => {
    expect(parseConfig({}, '.fix-has-test.json')).toEqual(emptyConfig);
  });

  it('rejects an unknown key and names the known ones', () => {
    expect(() => parseConfig({ testGlob: [] }, '.fix-has-test.json')).toThrow(
      '.fix-has-test.json has an unknown key "testGlob". Known keys: base, types, testGlobs, exemptScopes.'
    );
  });

  it.each([
    [{ base: 1 }, 'base must be a string'],
    [{ types: 'fix' }, 'types must be a list of strings'],
    [{ testGlobs: [1] }, 'testGlobs must hold only strings'],
    [[], 'must hold a JSON object'],
  ])('rejects %j', (value, message) => {
    expect(() => parseConfig(value, 'config')).toThrow(UsageError);
    expect(() => parseConfig(value, 'config')).toThrow(message);
  });
});

describe('splitList', () => {
  it('splits on commas across repeated flags and trims', () => {
    expect(splitList(['fix, perf', 'refactor'])).toEqual(['fix', 'perf', 'refactor']);
  });

  it('turns an empty string into an empty list, and no flag into undefined', () => {
    expect(splitList([''])).toEqual([]);
    expect(splitList(undefined)).toBeUndefined();
  });
});

describe('resolveOptions', () => {
  it('uses the defaults when nothing is set', () => {
    expect(resolveOptions(emptyConfig, emptyConfig)).toEqual({
      base: undefined,
      types: ['fix'],
      testGlobs: ['*.test.*', '*.spec.*', '*.feature', '**/__tests__/**', '**/tests/**'],
      exemptScopes: ['deps'],
    });
  });

  it('lets a flag replace the config list', () => {
    const options = resolveOptions(
      { ...emptyConfig, types: ['perf'], exemptScopes: [] },
      { ...emptyConfig, types: ['fix'], testGlobs: ['*_test.go'], exemptScopes: ['deps'] }
    );

    expect(options).toMatchObject({ types: ['perf'], testGlobs: ['*_test.go'], exemptScopes: [] });
  });

  it('rejects an empty type list and an empty glob list', () => {
    expect(() => resolveOptions({ ...emptyConfig, types: [] }, emptyConfig)).toThrow(UsageError);
    expect(() => resolveOptions({ ...emptyConfig, testGlobs: [] }, emptyConfig)).toThrow(
      UsageError
    );
  });
});
