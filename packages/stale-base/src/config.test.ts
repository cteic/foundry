import { describe, expect, it } from 'vitest';

import { emptyConfig, parseConfig, resolveOptions, toCount, UsageError } from './config.ts';

describe('parseConfig', () => {
  it('reads every known key', () => {
    expect(
      parseConfig({ base: 'origin/dev', maxBehind: 5, fetch: true }, '.stale-base.json')
    ).toEqual({ base: 'origin/dev', maxBehind: 5, fetch: true });
  });

  it('leaves missing keys undefined', () => {
    expect(parseConfig({}, '.stale-base.json')).toEqual(emptyConfig);
  });

  it('rejects an unknown key and names the known ones', () => {
    expect(() => parseConfig({ maxBehnd: 1 }, '.stale-base.json')).toThrow(
      '.stale-base.json has an unknown key "maxBehnd". Known keys: base, maxBehind, fetch.'
    );
  });

  it.each([
    [{ base: 1 }, 'base must be a string'],
    [{ fetch: 'yes' }, 'fetch must be true or false'],
    [{ maxBehind: -1 }, 'maxBehind must be a whole number'],
    [{ maxBehind: 1.5 }, 'maxBehind must be a whole number'],
    [[], 'must hold a JSON object'],
  ])('rejects %j', (value, message) => {
    expect(() => parseConfig(value, 'config')).toThrow(UsageError);
    expect(() => parseConfig(value, 'config')).toThrow(message);
  });
});

describe('toCount', () => {
  it('reads a number from a flag string', () => {
    expect(toCount('12', '--max-behind')).toBe(12);
  });

  it.each(['', ' ', 'many', '-1', '1.5'])('rejects %j', (value) => {
    expect(() => toCount(value, '--max-behind')).toThrow(UsageError);
  });
});

describe('resolveOptions', () => {
  it('uses the defaults when nothing is set', () => {
    expect(resolveOptions(emptyConfig, emptyConfig)).toEqual({
      base: undefined,
      maxBehind: 0,
      fetch: false,
    });
  });

  it('lets a flag beat the config', () => {
    expect(
      resolveOptions(
        { base: 'origin/main', maxBehind: 2, fetch: undefined },
        { base: 'origin/dev', maxBehind: 9, fetch: true }
      )
    ).toEqual({ base: 'origin/main', maxBehind: 2, fetch: true });
  });
});
