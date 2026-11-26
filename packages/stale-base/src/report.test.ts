import { describe, expect, it } from 'vitest';

import { formatReport, type Report } from './report.ts';

function report(overrides: Partial<Report> = {}): Report {
  return {
    verdict: 'pass',
    dryRun: false,
    behind: 0,
    ahead: 2,
    maxBehind: 0,
    fetched: false,
    base: { ref: 'origin/dev', sha: 'aaaaaaa1111111' },
    head: { ref: 'feat/export', sha: 'bbbbbbb2222222' },
    mergeBase: { sha: 'aaaaaaa1111111', date: '2026-01-01T12:00:00.000Z', ageDays: 1 },
    merge: { status: 'clean', conflicts: [] },
    changedOnBase: 0,
    changedOnBranch: 2,
    overlap: [],
    ...overrides,
  };
}

describe('formatReport', () => {
  it('prints the counts, the merge base and the merge result', () => {
    expect(formatReport(report())).toBe(
      [
        'stale-base: PASS',
        '  feat/export is 0 commits behind origin/dev and 2 ahead',
        '  merge base aaaaaaa, committed 2026-01-01, 1 day ago',
        '  merge with origin/dev: clean',
        '  origin/dev as of the last fetch. Pass --fetch to update it first',
        '',
      ].join('\n')
    );
  });

  it('says when it fetched the base', () => {
    expect(formatReport(report({ fetched: true }))).toContain('  origin/dev fetched just now\n');
  });

  it('lists the overlapping files and the update commands on a failure', () => {
    const text = formatReport(
      report({
        verdict: 'fail',
        behind: 7,
        merge: { status: 'conflict', conflicts: ['src/a.ts'] },
        overlap: [
          { path: 'pnpm-lock.yaml', conflict: false },
          { path: 'src/a.ts', conflict: true },
        ],
      })
    );

    expect(text).toContain('  merge with origin/dev: conflict in 1 file\n');
    expect(text).toContain(
      [
        'Changed on origin/dev since the merge base, and also changed on this branch:',
        '  pnpm-lock.yaml',
        '  src/a.ts  (conflict)',
        '',
        '7 commits behind, 0 allowed. Update the branch:',
        '  git rebase origin/dev',
        '  git merge origin/dev    # if the branch is shared',
        'Then run the checks again. The old results describe the old base.',
        '',
      ].join('\n')
    );
  });

  it('names the conflict as the reason when the branch is inside the allowance', () => {
    const text = formatReport(
      report({
        verdict: 'fail',
        behind: 2,
        maxBehind: 5,
        merge: { status: 'conflict', conflicts: ['src/a.ts'] },
        overlap: [{ path: 'src/a.ts', conflict: true }],
      })
    );

    expect(text).toContain('The merge with origin/dev conflicts. Update the branch:');
  });

  it('explains a warning', () => {
    const text = formatReport(
      report({
        verdict: 'warn',
        behind: 2,
        maxBehind: 5,
        overlap: [{ path: 'src/a.ts', conflict: false }],
      })
    );

    expect(text).toContain('stale-base: WARN');
    expect(text).toContain(
      'Within the allowance of 5, but the base changed files this branch changes.'
    );
  });

  it('shows 20 overlapping files and counts the rest', () => {
    const overlap = Array.from({ length: 23 }, (_, index) => ({
      path: `src/file-${String(index).padStart(2, '0')}.ts`,
      conflict: false,
    }));
    const text = formatReport(report({ verdict: 'fail', behind: 1, overlap }));

    expect(text).toContain('  src/file-19.ts\n  and 3 more files. --json lists them.');
    expect(text).not.toContain('src/file-20.ts');
  });

  it('says when the merge could not be checked', () => {
    expect(formatReport(report({ merge: { status: 'unknown', conflicts: [] } }))).toContain(
      'merge with origin/dev: not checked. git merge-tree --write-tree needs git 2.38 or later'
    );
  });

  it('marks a dry run', () => {
    expect(formatReport(report({ verdict: 'fail', behind: 1, dryRun: true }))).toContain(
      'stale-base: FAIL  (dry run: exit code stays 0)'
    );
  });
});
