import type { FixCommit, FixStatus, IgnoredCommit } from './commits.ts';
import type { Base } from './git.ts';
import type { TestFile } from './test-files.ts';

export interface Report {
  verdict: 'pass' | 'fail';
  dryRun: boolean;
  base: Base;
  commits: number;
  types: string[];
  fixes: FixCommit[];
  ignored: IgnoredCommit[];
  testFiles: TestFile[];
}

const shownTestFiles = 10;

const headings: Record<FixStatus, string> = {
  'needs-test': 'Needs a test',
  waived: 'Waived by a No-test line in the commit body',
  exempt: 'Exempt',
};

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function withStatus(report: Report, status: FixStatus): FixCommit[] {
  return report.fixes.filter((fix) => fix.status === status);
}

function summary(report: Report): string {
  const needing = withStatus(report, 'needs-test').length;
  if (needing === 0) {
    return `  no ${report.types.join(' or ')} commit needs a test`;
  }
  const verb = needing === 1 ? 'needs' : 'need';
  const tests =
    report.testFiles.length === 0
      ? 'the branch changes no test file'
      : `the branch changes ${plural(report.testFiles.length, 'test file')}`;
  return `  ${plural(needing, 'commit')} ${verb} a test, and ${tests}`;
}

function section(report: Report, status: FixStatus): string[] {
  const fixes = withStatus(report, status);
  if (fixes.length === 0) {
    return [];
  }
  const rows = fixes.flatMap((fix) => [
    `  ${fix.hash.slice(0, 7)}  ${fix.subject}`,
    ...(fix.note === '' ? [] : [`      ${status === 'waived' ? 'No-test: ' : ''}${fix.note}`]),
  ]);
  return ['', headings[status], ...rows];
}

function ignoredSection(ignored: readonly IgnoredCommit[]): string[] {
  if (ignored.length === 0) {
    return [];
  }
  const merges = ignored.filter((commit) => commit.reason === 'merge').length;
  const reverts = ignored
    .filter((commit) => commit.reason === 'revert')
    .map((commit) => `  ${commit.hash.slice(0, 7)}  ${commit.subject}  (revert)`);
  const mergeRow = merges > 0 ? [`  ${plural(merges, 'merge commit')}. --json lists them.`] : [];
  return ['', 'Ignored', ...reverts, ...mergeRow];
}

function testSection(report: Report): string[] {
  if (report.testFiles.length === 0 || withStatus(report, 'needs-test').length === 0) {
    return [];
  }
  const rows = report.testFiles
    .slice(0, shownTestFiles)
    .map((file) => `  ${file.path}  (${file.reason})`);
  const hidden = report.testFiles.length - rows.length;
  const more = hidden > 0 ? [`  and ${plural(hidden, 'more file')}. --json lists them.`] : [];
  return ['', 'Test files changed', ...rows, ...more];
}

function advice(report: Report): string[] {
  if (report.verdict === 'pass') {
    return [];
  }
  return [
    '',
    'Add a regression test in this branch: one that fails without the fix.',
    'If no test can cover it, say why in the commit body. The reason is reported:',
    '  No-test: <reason>',
  ];
}

export function formatReport(report: Report): string {
  const dryRun = report.dryRun ? '  (dry run: exit code stays 0)' : '';
  const output = [
    `fix-has-test: ${report.verdict.toUpperCase()}${dryRun}`,
    `  ${plural(report.commits, 'commit')} checked against ${report.base.ref} (${report.base.sha.slice(0, 7)})`,
    summary(report),
    ...section(report, 'needs-test'),
    ...section(report, 'waived'),
    ...section(report, 'exempt'),
    ...ignoredSection(report.ignored),
    ...testSection(report),
    ...advice(report),
  ];
  return `${output.join('\n')}\n`;
}
