import { describe, expect, it } from 'vitest';

import {
  decideVerdict,
  defaultLimits,
  groupByDirectory,
  parseNumstat,
  partitionChanges,
  sumLines,
  type CountedFile,
  type ExcludeRules,
} from './size.ts';

const noRules: ExcludeRules = {
  exclude: [],
  includeGenerated: false,
  linguistGenerated: new Set(),
};

function counted(path: string, lines: number): CountedFile {
  return { path, added: lines, deleted: 0, binary: false, lines };
}

describe('parseNumstat', () => {
  it('reads added and deleted counts per file', () => {
    expect(parseNumstat('3\t1\tsrc/a.ts\x0010\t0\tREADME.md\0')).toEqual([
      { path: 'src/a.ts', added: 3, deleted: 1, binary: false },
      { path: 'README.md', added: 10, deleted: 0, binary: false },
    ]);
  });

  it('counts a binary file as zero lines', () => {
    expect(parseNumstat('-\t-\tlogo.bin\0')).toEqual([
      { path: 'logo.bin', added: 0, deleted: 0, binary: true },
    ]);
  });

  it('uses the new path of a rename', () => {
    expect(parseNumstat('2\t2\t\0old/name.ts\0new/name.ts\x005\t0\tb.ts\0')).toEqual([
      { path: 'new/name.ts', added: 2, deleted: 2, binary: false },
      { path: 'b.ts', added: 5, deleted: 0, binary: false },
    ]);
  });

  it('keeps tabs, spaces and newlines in a path', () => {
    expect(parseNumstat('1\t0\todd\tname\n here.ts\0')[0]?.path).toBe('odd\tname\n here.ts');
  });

  it('returns nothing for an empty diff', () => {
    expect(parseNumstat('')).toEqual([]);
  });

  it('throws on a record it cannot read', () => {
    expect(() => parseNumstat('not numstat\0')).toThrow(/Cannot parse numstat record/);
  });
});

describe('partitionChanges', () => {
  const changes = parseNumstat(
    [
      '10\t5\tsrc/a.ts',
      '900\t20\tpnpm-lock.yaml',
      '40\t0\tsrc/__snapshots__/a.test.ts.snap',
      '7\t0\tpackages/x/dist/index.js',
      '30\t0\tsrc/schema.gen.ts',
      '50\t0\tdocs/guide.md',
      '-\t-\tlogo.png',
      '',
    ].join('\0')
  );

  it('leaves out generated paths by default and says why', () => {
    const { counted: kept, excluded } = partitionChanges(changes, noRules);

    expect(kept.map((file) => file.path)).toEqual([
      'docs/guide.md',
      'src/schema.gen.ts',
      'src/a.ts',
    ]);
    expect(excluded).toEqual([
      { path: 'pnpm-lock.yaml', lines: 920, reason: 'generated: pnpm-lock.yaml' },
      { path: 'src/__snapshots__/a.test.ts.snap', lines: 40, reason: 'generated: *.snap' },
      { path: 'packages/x/dist/index.js', lines: 7, reason: 'generated: **/dist/**' },
      { path: 'logo.png', lines: 0, reason: 'generated: *.png' },
    ]);
  });

  it('leaves out paths that git marks linguist-generated', () => {
    const { excluded } = partitionChanges(changes, {
      ...noRules,
      linguistGenerated: new Set(['src/schema.gen.ts']),
    });

    expect(excluded).toContainEqual({
      path: 'src/schema.gen.ts',
      lines: 30,
      reason: 'linguist-generated',
    });
  });

  it('counts generated paths with includeGenerated, but still applies exclude globs', () => {
    const { counted: kept, excluded } = partitionChanges(changes, {
      exclude: ['docs/**'],
      includeGenerated: true,
      linguistGenerated: new Set(['src/schema.gen.ts']),
    });

    expect(excluded).toEqual([{ path: 'docs/guide.md', lines: 50, reason: 'exclude: docs/**' }]);
    expect(kept).toHaveLength(6);
    expect(sumLines(kept)).toBe(1012);
  });

  it('sorts counted files largest first', () => {
    const { counted: kept } = partitionChanges(changes, noRules);

    expect(kept.map((file) => file.lines)).toEqual([50, 30, 15]);
  });
});

describe('decideVerdict', () => {
  it.each([
    [0, 0, 'pass'],
    [319, 19, 'pass'],
    [320, 1, 'warn'],
    [1, 20, 'warn'],
    [400, 25, 'warn'],
    [401, 1, 'fail'],
    [1, 26, 'fail'],
  ])('%i lines in %i files is %s', (lines, files, expected) => {
    expect(decideVerdict(lines, files, defaultLimits)).toBe(expected);
  });

  it('never warns when warnAt is 1 and the change is under the limit', () => {
    expect(decideVerdict(399, 24, { ...defaultLimits, warnAt: 1 })).toBe('pass');
  });
});

describe('groupByDirectory', () => {
  it('groups by top-level directory, largest first', () => {
    const groups = groupByDirectory([
      counted('src/a.ts', 10),
      counted('src/deep/b.ts', 20),
      counted('docs/a.md', 5),
      counted('README.md', 1),
    ]);

    expect(groups).toEqual([
      { directory: 'src', lines: 30, files: 2 },
      { directory: 'docs', lines: 5, files: 1 },
      { directory: '.', lines: 1, files: 1 },
    ]);
  });

  it('goes deeper until the change splits into more than one group', () => {
    const groups = groupByDirectory([
      counted('packages/api/src/a.ts', 10),
      counted('packages/web/src/b.ts', 20),
    ]);

    expect(groups.map((group) => group.directory)).toEqual(['packages/web', 'packages/api']);
  });

  it('goes deeper when one group holds over 90% of the lines', () => {
    const groups = groupByDirectory([
      counted('packages/api/src/a.ts', 300),
      counted('packages/api/test/a.test.ts', 200),
      counted('.changeset/api.md', 5),
    ]);

    expect(groups).toEqual([
      { directory: 'packages/api/src', lines: 300, files: 1 },
      { directory: 'packages/api/test', lines: 200, files: 1 },
      { directory: '.changeset', lines: 5, files: 1 },
    ]);
  });

  it('returns one group when every file shares a directory', () => {
    expect(groupByDirectory([counted('src/a.ts', 1), counted('src/b.ts', 2)])).toEqual([
      { directory: 'src', lines: 3, files: 2 },
    ]);
  });

  it('returns nothing for no files', () => {
    expect(groupByDirectory([])).toEqual([]);
  });
});
