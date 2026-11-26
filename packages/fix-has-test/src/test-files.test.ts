import { describe, expect, it } from 'vitest';

import { defaultTestGlobs, findRustTests, findTestFiles, mergeTestFiles } from './test-files.ts';

describe('findTestFiles', () => {
  it.each([
    ['src/export.test.ts', '*.test.*'],
    ['apps/web/e2e/login.spec.ts', '*.spec.*'],
    ['features/export.feature', '*.feature'],
    ['src/__tests__/export.ts', '**/__tests__/**'],
    ['tests/export.rs', '**/tests/**'],
    ['crates/core/tests/export.rs', '**/tests/**'],
  ])('counts %s', (path, glob) => {
    expect(findTestFiles([path], defaultTestGlobs)).toEqual([{ path, reason: `matches ${glob}` }]);
  });

  it.each([
    'src/export.ts',
    'src/latest.ts',
    'src/contests/a.ts',
    'src/export.test.ts.snap',
    'src/__tests__/__snapshots__/export.snap',
    'docs/testing.md',
  ])('does not count %s', (path) => {
    expect(findTestFiles([path], defaultTestGlobs)).toEqual([]);
  });

  it('uses the globs it is given', () => {
    expect(findTestFiles(['a_test.go', 'a.test.ts'], ['*_test.go'])).toEqual([
      { path: 'a_test.go', reason: 'matches *_test.go' },
    ]);
  });
});

describe('findRustTests', () => {
  it.each([
    '#[test]',
    '    #[test]',
    '#[tokio::test]',
    '#[tokio::test(flavor = "current_thread")]',
  ])('counts an added %s line in a Rust file', (text) => {
    expect(findRustTests([{ path: 'src/lib.rs', line: 40, text }])).toEqual([
      { path: 'src/lib.rs', reason: 'adds a Rust #[test]' },
    ]);
  });

  it.each([
    ['src/lib.rs', '#[cfg(test)]'],
    ['src/lib.rs', '// #[test]'],
    ['src/lib.rs', '#[test_case(1)]'],
    ['src/lib.rs', 'assert_eq!(parse("a"), 1);'],
    ['docs/guide.md', '#[test]'],
  ])('does not count %s with %j', (path, text) => {
    expect(findRustTests([{ path, line: 1, text }])).toEqual([]);
  });

  it('lists a file once', () => {
    expect(
      findRustTests([
        { path: 'src/lib.rs', line: 40, text: '#[test]' },
        { path: 'src/lib.rs', line: 52, text: '#[test]' },
      ])
    ).toHaveLength(1);
  });
});

describe('mergeTestFiles', () => {
  it('sorts by path and keeps the glob reason when both find a file', () => {
    expect(
      mergeTestFiles(
        [{ path: 'tests/b.rs', reason: 'matches **/tests/**' }],
        [
          { path: 'tests/b.rs', reason: 'adds a Rust #[test]' },
          { path: 'src/a.rs', reason: 'adds a Rust #[test]' },
        ]
      )
    ).toEqual([
      { path: 'src/a.rs', reason: 'adds a Rust #[test]' },
      { path: 'tests/b.rs', reason: 'matches **/tests/**' },
    ]);
  });
});
