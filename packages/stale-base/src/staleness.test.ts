import { describe, expect, it } from 'vitest';

import {
  ageInDays,
  decideVerdict,
  findOverlap,
  parseCounts,
  parseMergeTree,
  parsePaths,
} from './staleness.ts';

describe('parseCounts', () => {
  it('reads behind then ahead from rev-list --left-right --count', () => {
    expect(parseCounts('7\t3\n')).toEqual({ behind: 7, ahead: 3 });
  });

  it('throws on output it does not know', () => {
    expect(() => parseCounts('fatal: bad revision')).toThrow('Cannot parse the commit counts');
  });
});

describe('parsePaths', () => {
  it('splits on NUL and keeps spaces and newlines inside a path', () => {
    expect(parsePaths('a.ts\0dir/b c.ts\0odd\nname.ts\0')).toEqual([
      'a.ts',
      'dir/b c.ts',
      'odd\nname.ts',
    ]);
  });
});

describe('parseMergeTree', () => {
  it('reports a clean merge on exit 0', () => {
    expect(parseMergeTree(0, 'abc123\0')).toEqual({ status: 'clean', conflicts: [] });
  });

  it('lists the conflicted paths on exit 1, without the tree id', () => {
    expect(parseMergeTree(1, 'abc123\0src/b.ts\0src/a.ts\0src/a.ts\0')).toEqual({
      status: 'conflict',
      conflicts: ['src/a.ts', 'src/b.ts'],
    });
  });

  it.each([129, 128, null])('reports unknown on exit %s', (status) => {
    expect(parseMergeTree(status, '')).toEqual({ status: 'unknown', conflicts: [] });
  });
});

describe('findOverlap', () => {
  it('keeps the paths both sides changed, sorted, and marks conflicts', () => {
    expect(
      findOverlap(
        ['src/b.ts', 'src/a.ts', 'base-only.ts'],
        ['src/a.ts', 'src/b.ts', 'mine.ts'],
        ['src/b.ts']
      )
    ).toEqual([
      { path: 'src/a.ts', conflict: false },
      { path: 'src/b.ts', conflict: true },
    ]);
  });

  it('adds a conflicted path that neither list holds, such as a rename target', () => {
    expect(findOverlap(['old.ts'], ['other.ts'], ['new.ts'])).toEqual([
      { path: 'new.ts', conflict: true },
    ]);
  });
});

describe('ageInDays', () => {
  it('counts whole days', () => {
    expect(ageInDays(new Date('2026-01-01T12:00:00Z'), new Date('2026-01-25T11:00:00Z'))).toBe(23);
  });

  it('never goes below 0 when a commit date is in the future', () => {
    expect(ageInDays(new Date('2026-02-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBe(0);
  });
});

describe('decideVerdict', () => {
  it.each([
    [0, 0, 'clean', 0, 'pass'],
    [1, 0, 'clean', 0, 'fail'],
    [3, 5, 'clean', 0, 'pass'],
    [3, 5, 'clean', 2, 'warn'],
    [3, 5, 'conflict', 1, 'fail'],
    [3, 5, 'unknown', 0, 'pass'],
    [6, 5, 'clean', 0, 'fail'],
  ] as const)(
    '%i behind of %i allowed, merge %s, %i overlapping files: %s',
    (behind, maxBehind, merge, overlapping, verdict) => {
      expect(decideVerdict(behind, maxBehind, merge, overlapping)).toBe(verdict);
    }
  );
});
