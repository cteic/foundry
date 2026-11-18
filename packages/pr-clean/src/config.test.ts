import { describe, expect, it } from 'vitest';

import { emptyConfig, parseConfig, resolveOptions, UsageError } from './config.ts';

const owner = 'Ada Example <ada@example.com>';

describe('parseConfig', () => {
  it('reads every known key', () => {
    const value = {
      base: 'origin/dev',
      allowAuthors: [owner],
      skip: ['em-dash'],
      ignore: ['CHANGELOG.md'],
      emDashFiles: ['*.md'],
    };

    expect(parseConfig(value, '.pr-clean.json')).toEqual(value);
  });

  it.each([
    ['a list', []],
    ['an unknown key', { allowAuthor: [owner] }],
    ['a non-string base', { base: 1 }],
    ['a non-list allowAuthors', { allowAuthors: owner }],
    ['a non-string rule', { skip: [1] }],
  ])('rejects %s', (_name, value) => {
    expect(() => parseConfig(value, '.pr-clean.json')).toThrow(UsageError);
  });
});

describe('resolveOptions', () => {
  it('adds flag lists to config lists and uses the default prose globs', () => {
    const config = { ...emptyConfig, allowAuthors: [owner], ignore: ['a.md'] };
    const flags = { ...emptyConfig, skip: ['em-dash'], ignore: ['b.md'], base: 'main' };

    expect(resolveOptions(flags, config)).toEqual({
      base: 'main',
      allowAuthors: [owner],
      skip: ['em-dash'],
      ignore: ['a.md', 'b.md'],
      emDashFiles: ['*.md', '*.mdx', '*.txt'],
    });
  });

  it('lets --em-dash-files replace the config value', () => {
    const config = { ...emptyConfig, allowAuthors: [owner], emDashFiles: ['*.md'] };

    expect(resolveOptions({ ...emptyConfig, emDashFiles: ['*'] }, config).emDashFiles).toEqual([
      '*',
    ]);
  });

  it('refuses to run the author rule with no allowed list', () => {
    expect(() => resolveOptions(emptyConfig, emptyConfig)).toThrow(
      'The author rule needs an allowed list'
    );
  });

  it('runs with no allowed list when the author rule is skipped', () => {
    expect(resolveOptions({ ...emptyConfig, skip: ['author'] }, emptyConfig).allowAuthors).toEqual(
      []
    );
  });

  it('rejects an unknown rule and a malformed author', () => {
    const allowed = { ...emptyConfig, allowAuthors: [owner] };

    expect(() => resolveOptions({ ...emptyConfig, skip: ['conventional'] }, allowed)).toThrow(
      'Unknown rule "conventional"'
    );
    expect(() =>
      resolveOptions({ ...emptyConfig, allowAuthors: ['ada@example.com'] }, emptyConfig)
    ).toThrow('must look like "Name <email>"');
  });
});
