import { describe, expect, it } from 'vitest';

import { firstMatch, globToRegExp } from './glob.ts';

describe('globToRegExp', () => {
  it.each([
    ['*.snap', 'a.snap', true],
    ['*.snap', 'src/deep/a.snap', true],
    ['*.snap', 'a.snap.ts', false],
    ['pnpm-lock.yaml', 'apps/web/pnpm-lock.yaml', true],
    ['**/dist/**', 'dist/index.js', true],
    ['**/dist/**', 'packages/a/dist/x/index.js', true],
    ['**/dist/**', 'src/distance.ts', false],
    ['docs/*.md', 'docs/a.md', true],
    ['docs/*.md', 'docs/sub/a.md', false],
    ['docs/*.md', 'packages/docs/a.md', false],
    ['docs/**', 'docs/sub/a.md', true],
    ['./docs/**', 'docs/a.md', true],
    ['file?.ts', 'file1.ts', true],
    ['file?.ts', 'file/.ts', false],
    ['a+b(1).ts', 'a+b(1).ts', true],
  ])('%s against %s is %s', (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });
});

describe('firstMatch', () => {
  it('returns the first glob that matches, or undefined', () => {
    expect(firstMatch('a/b.min.js', ['*.png', '*.min.js', '**'])).toBe('*.min.js');
    expect(firstMatch('a/b.ts', ['*.png'])).toBeUndefined();
  });
});
