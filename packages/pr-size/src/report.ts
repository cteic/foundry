import type { CountedFile, DirectoryGroup, ExcludedFile, Limits, Verdict } from './size.ts';

export interface Report {
  verdict: Verdict;
  dryRun: boolean;
  lines: number;
  files: number;
  limits: Limits;
  base: { ref: string; sha: string };
  counted: CountedFile[];
  excluded: ExcludedFile[];
  groups: DirectoryGroup[];
}

const shownFiles = 10;
const shownGroups = 6;

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function column(value: number, width: number): string {
  return String(value).padStart(width);
}

function fileTable(counted: readonly CountedFile[]): string[] {
  const rows = counted.slice(0, shownFiles).map((file) => {
    const note = file.binary ? '  (binary)' : '';
    return `  ${column(file.lines, 5)}  ${column(file.added, 5)}  ${column(file.deleted, 7)}  ${file.path}${note}`;
  });
  const hidden = counted.length - rows.length;
  const more = hidden > 0 ? [`  and ${plural(hidden, 'smaller file')}`] : [];
  return ['  lines  added  deleted  file', ...rows, ...more];
}

function groupTable(groups: readonly DirectoryGroup[]): string[] {
  const rows = groups
    .slice(0, shownGroups)
    .map((group) => `  ${column(group.lines, 5)}  ${column(group.files, 5)}  ${group.directory}`);
  return ['  lines  files  directory', ...rows];
}

function advice(report: Report): string[] {
  const { lines, files, limits, groups } = report;
  if (report.verdict === 'pass') {
    return [];
  }
  if (report.verdict === 'warn') {
    const percent = String(Math.round(limits.warnAt * 100));
    return ['', `Close to the limit: over ${percent}% of it is used. Stop adding scope here.`];
  }
  const over = [
    ...(lines > limits.maxLines ? [`${String(lines - limits.maxLines)} lines`] : []),
    ...(files > limits.maxFiles ? [`${String(files - limits.maxFiles)} files`] : []),
  ].join(' and ');
  const head = ['', `Over the limit by ${over}. Too big to review in one pass.`];
  if (groups.length < 2) {
    return [
      ...head,
      'All counted changes sit in one directory. Split by concern instead:',
      'refactor first, then the feature with its tests, then config.',
    ];
  }
  return [
    ...head,
    'Split it by directory, one pull request per group:',
    '',
    ...groupTable(groups),
    '',
    'Move one group to its own branch:',
    '  git switch -c <new-branch> <base>',
    '  git checkout <this-branch> -- <directory>',
  ];
}

export function formatReport(report: Report): string {
  const { limits } = report;
  const dryRun = report.dryRun ? '  (dry run: exit code stays 0)' : '';
  const output = [
    `pr-size: ${report.verdict.toUpperCase()}${dryRun}`,
    `  ${plural(report.lines, 'changed line')} of ${String(limits.maxLines)} allowed`,
    `  ${plural(report.files, 'changed file')} of ${String(limits.maxFiles)} allowed`,
    `  base ${report.base.ref} (${report.base.sha.slice(0, 7)})`,
  ];
  if (report.counted.length > 0) {
    output.push('', ...fileTable(report.counted));
  }
  if (report.excluded.length > 0) {
    const excludedLines = report.excluded.reduce((total, file) => total + file.lines, 0);
    output.push(
      '',
      `Not counted: ${plural(report.excluded.length, 'file')}, ${plural(excludedLines, 'line')} (generated or excluded). --json lists them.`
    );
  }
  output.push(...advice(report));
  return `${output.join('\n')}\n`;
}
