import type { AddedLine } from './diff.ts';
import { firstMatch } from './glob.ts';

export interface TestFile {
  path: string;
  reason: string;
}

export const defaultTestGlobs: readonly string[] = [
  '*.test.*',
  '*.spec.*',
  '*.feature',
  '**/__tests__/**',
  '**/tests/**',
];

export const snapshotGlobs: readonly string[] = ['*.snap', '**/__snapshots__/**'];

export const rustTestReason = 'adds a Rust #[test]';

const rustTestAttribute = /^\s*#\[(?:[A-Za-z_]\w*::)*test\b/;

export function findTestFiles(paths: readonly string[], globs: readonly string[]): TestFile[] {
  return paths.flatMap((path) => {
    if (firstMatch(path, snapshotGlobs) !== undefined) {
      return [];
    }
    const glob = firstMatch(path, globs);
    return glob === undefined ? [] : [{ path, reason: `matches ${glob}` }];
  });
}

export function findRustTests(added: readonly AddedLine[]): TestFile[] {
  const paths = new Set(
    added
      .filter((line) => line.path.endsWith('.rs') && rustTestAttribute.test(line.text))
      .map((line) => line.path)
  );
  return [...paths].map((path) => ({ path, reason: rustTestReason }));
}

export function mergeTestFiles(
  byGlob: readonly TestFile[],
  byRust: readonly TestFile[]
): TestFile[] {
  const seen = new Set(byGlob.map((file) => file.path));
  return [...byGlob, ...byRust.filter((file) => !seen.has(file.path))].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
}
