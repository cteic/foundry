import { describe, expect, it } from 'vitest';

import { formatReport, type Report } from './report.ts';
import { defaultLimits, groupByDirectory, type CountedFile } from './size.ts';

function counted(path: string, added: number, deleted = 0): CountedFile {
  return { path, added, deleted, binary: false, lines: added + deleted };
}

function report(files: CountedFile[], overrides: Partial<Report> = {}): Report {
  return {
    verdict: 'pass',
    dryRun: false,
    lines: files.reduce((total, file) => total + file.lines, 0),
    files: files.length,
    limits: defaultLimits,
    base: { ref: 'origin/HEAD', sha: '0123456789abcdef' },
    counted: files,
    excluded: [],
    groups: groupByDirectory(files),
    ...overrides,
  };
}

describe('formatReport', () => {
  it('prints the totals, the base and the files', () => {
    const text = formatReport(report([counted('src/a.ts', 30, 12), counted('b.ts', 1)]));

    expect(text).toBe(
      [
        'pr-size: PASS',
        '  43 changed lines of 400 allowed',
        '  2 changed files of 25 allowed',
        '  base origin/HEAD (0123456)',
        '',
        '  lines  added  deleted  file',
        '     42     30       12  src/a.ts',
        '      1      1        0  b.ts',
        '',
      ].join('\n')
    );
  });

  it('shows the ten largest files and counts the rest', () => {
    const files = Array.from({ length: 13 }, (_, i) => counted(`src/f${String(i)}.ts`, 20 - i));
    const text = formatReport(report(files));

    expect(text).toContain('src/f9.ts');
    expect(text).not.toContain('src/f10.ts');
    expect(text).toContain('and 3 smaller files');
  });

  it('says how many files were not counted', () => {
    const text = formatReport(
      report([counted('a.ts', 1)], {
        excluded: [{ path: 'pnpm-lock.yaml', lines: 900, reason: 'generated: pnpm-lock.yaml' }],
      })
    );

    expect(text).toContain('Not counted: 1 file, 900 lines (generated or excluded).');
  });

  it('tells the author to split by concern when one directory holds everything', () => {
    const text = formatReport(report([counted('src/a.ts', 500)], { verdict: 'fail' }));

    expect(text).toContain('Over the limit by 100 lines.');
    expect(text).toContain('Split by concern instead');
  });

  it('names both limits when both are broken', () => {
    const files = Array.from({ length: 30 }, (_, i) =>
      counted(`d${String(i % 2)}/f${String(i)}.ts`, 20)
    );
    const text = formatReport(report(files, { verdict: 'fail' }));

    expect(text).toContain('Over the limit by 200 lines and 5 files.');
    expect(text).toContain('git checkout <this-branch> -- <directory>');
  });
});
