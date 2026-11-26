import { describe, expect, it } from 'vitest';

import type { FixCommit } from './commits.ts';
import { formatReport, type Report } from './report.ts';

function fix(overrides: Partial<FixCommit> = {}): FixCommit {
  return {
    hash: '4f2a9c1aaaaaaa',
    subject: 'fix(web): stop the double submit',
    type: 'fix',
    scope: 'web',
    breaking: false,
    status: 'needs-test',
    note: '',
    ...overrides,
  };
}

function report(overrides: Partial<Report> = {}): Report {
  return {
    verdict: 'pass',
    dryRun: false,
    base: { ref: 'origin/HEAD', sha: '18fc314bbbbbbb' },
    commits: 1,
    types: ['fix'],
    fixes: [],
    ignored: [],
    testFiles: [],
    ...overrides,
  };
}

describe('formatReport', () => {
  it('passes a branch with no fix commit', () => {
    expect(formatReport(report())).toBe(
      [
        'fix-has-test: PASS',
        '  1 commit checked against origin/HEAD (18fc314)',
        '  no fix commit needs a test',
        '',
      ].join('\n')
    );
  });

  it('lists the fix and the advice on a failure', () => {
    expect(formatReport(report({ verdict: 'fail', fixes: [fix()] }))).toBe(
      [
        'fix-has-test: FAIL',
        '  1 commit checked against origin/HEAD (18fc314)',
        '  1 commit needs a test, and the branch changes no test file',
        '',
        'Needs a test',
        '  4f2a9c1  fix(web): stop the double submit',
        '',
        'Add a regression test in this branch: one that fails without the fix.',
        'If no test can cover it, say why in the commit body. The reason is reported:',
        '  No-test: <reason>',
        '',
      ].join('\n')
    );
  });

  it('lists the test files that let a fix pass', () => {
    const text = formatReport(
      report({
        fixes: [fix(), fix({ hash: '9ab01cdaaaaaaa' })],
        testFiles: [{ path: 'src/export.test.ts', reason: 'matches *.test.*' }],
      })
    );

    expect(text).toContain('  2 commits need a test, and the branch changes 1 test file\n');
    expect(text).toContain('Test files changed\n  src/export.test.ts  (matches *.test.*)\n');
  });

  it('always shows waived, exempt and ignored commits with the reason', () => {
    const text = formatReport(
      report({
        commits: 4,
        fixes: [
          fix({ status: 'waived', note: 'workflow file only' }),
          fix({
            hash: '77de012aaaaaaa',
            subject: 'fix(deps): update dependency zod to v4.1.2',
            status: 'exempt',
            note: 'scope deps, dependency files only',
          }),
        ],
        ignored: [
          { hash: 'c0ffee1aaaaaaa', subject: 'Revert "fix: x"', reason: 'revert' },
          { hash: 'deadbee1aaaaaa', subject: 'Merge branch dev', reason: 'merge' },
        ],
      })
    );

    expect(text).toBe(
      [
        'fix-has-test: PASS',
        '  4 commits checked against origin/HEAD (18fc314)',
        '  no fix commit needs a test',
        '',
        'Waived by a No-test line in the commit body',
        '  4f2a9c1  fix(web): stop the double submit',
        '      No-test: workflow file only',
        '',
        'Exempt',
        '  77de012  fix(deps): update dependency zod to v4.1.2',
        '      scope deps, dependency files only',
        '',
        'Ignored',
        '  c0ffee1  Revert "fix: x"  (revert)',
        '  1 merge commit. --json lists them.',
        '',
      ].join('\n')
    );
  });

  it('names every checked type and marks a dry run', () => {
    const text = formatReport(report({ types: ['fix', 'perf'], dryRun: true }));

    expect(text).toContain('fix-has-test: PASS  (dry run: exit code stays 0)');
    expect(text).toContain('no fix or perf commit needs a test');
  });
});
