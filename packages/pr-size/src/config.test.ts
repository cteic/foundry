import { describe, expect, it } from 'vitest';

import {
  emptyConfig,
  parseConfig,
  resolveOptions,
  toCount,
  toFraction,
  UsageError,
} from './config.ts';

describe('parseConfig', () => {
  it('reads every known key', () => {
    const config = parseConfig(
      {
        base: 'origin/dev',
        maxLines: 300,
        maxFiles: 10,
        warnAt: 0.5,
        exclude: ['docs/**'],
        includeGenerated: true,
      },
      '.pr-size.json'
    );

    expect(config).toEqual({
      base: 'origin/dev',
      maxLines: 300,
      maxFiles: 10,
      warnAt: 0.5,
      exclude: ['docs/**'],
      includeGenerated: true,
    });
  });

  it.each([
    ['a list', []],
    ['an unknown key', { maxLine: 1 }],
    ['a negative limit', { maxLines: -1 }],
    ['a fractional limit', { maxFiles: 1.5 }],
    ['a warn level above 1', { warnAt: 2 }],
    ['a warn level of 0', { warnAt: 0 }],
    ['a non-string glob', { exclude: [1] }],
    ['a non-list exclude', { exclude: 'docs/**' }],
    ['a non-string base', { base: 1 }],
    ['a non-boolean includeGenerated', { includeGenerated: 'yes' }],
  ])('rejects %s', (_name, value) => {
    expect(() => parseConfig(value, '.pr-size.json')).toThrow(UsageError);
  });

  it('names the file and the bad key', () => {
    expect(() => parseConfig({ maxLine: 1 }, '.pr-size.json')).toThrow(
      '.pr-size.json has an unknown key "maxLine"'
    );
  });
});

describe('flag values', () => {
  it('reads numbers from flag text', () => {
    expect(toCount('250', '--max-lines')).toBe(250);
    expect(toFraction('0.9', '--warn-at')).toBe(0.9);
  });

  it.each(['', 'abc', '1.5', '-3'])('rejects %j as a count', (text) => {
    expect(() => toCount(text, '--max-lines')).toThrow(UsageError);
  });
});

describe('resolveOptions', () => {
  it('uses the defaults when nothing is set', () => {
    expect(resolveOptions(emptyConfig, emptyConfig)).toEqual({
      base: undefined,
      limits: { maxLines: 400, maxFiles: 25, warnAt: 0.8 },
      exclude: [],
      includeGenerated: false,
    });
  });

  it('lets a flag beat the config file, and adds exclude globs together', () => {
    const config = { ...emptyConfig, maxLines: 300, maxFiles: 10, exclude: ['docs/**'] };
    const flags = { ...emptyConfig, maxLines: 100, exclude: ['*.md'], base: 'main' };

    expect(resolveOptions(flags, config)).toEqual({
      base: 'main',
      limits: { maxLines: 100, maxFiles: 10, warnAt: 0.8 },
      exclude: ['docs/**', '*.md'],
      includeGenerated: false,
    });
  });
});
