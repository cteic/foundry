import type { Ref } from './git.ts';
import type { MergeCheck, OverlapFile, Verdict } from './staleness.ts';

export interface MergeBase {
  sha: string;
  date: string;
  ageDays: number;
}

export interface Report {
  verdict: Verdict;
  dryRun: boolean;
  behind: number;
  ahead: number;
  maxBehind: number;
  fetched: boolean;
  base: Ref;
  head: Ref;
  mergeBase: MergeBase;
  merge: MergeCheck;
  changedOnBase: number;
  changedOnBranch: number;
  overlap: OverlapFile[];
}

const shownFiles = 20;

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function mergeLine(report: Report): string {
  const { merge, base } = report;
  if (merge.status === 'clean') {
    return `  merge with ${base.ref}: clean`;
  }
  if (merge.status === 'conflict') {
    return `  merge with ${base.ref}: conflict in ${plural(merge.conflicts.length, 'file')}`;
  }
  return `  merge with ${base.ref}: not checked. git merge-tree --write-tree needs git 2.38 or later`;
}

function overlapTable(report: Report): string[] {
  const { overlap, base } = report;
  if (overlap.length === 0) {
    return [];
  }
  const rows = overlap
    .slice(0, shownFiles)
    .map((file) => `  ${file.path}${file.conflict ? '  (conflict)' : ''}`);
  const hidden = overlap.length - rows.length;
  const more = hidden > 0 ? [`  and ${plural(hidden, 'more file')}. --json lists them.`] : [];
  return [
    '',
    `Changed on ${base.ref} since the merge base, and also changed on this branch:`,
    ...rows,
    ...more,
  ];
}

function advice(report: Report): string[] {
  const { base, behind, maxBehind } = report;
  if (report.verdict === 'pass') {
    return [];
  }
  const update = [
    `  git rebase ${base.ref}`,
    `  git merge ${base.ref}    # if the branch is shared`,
    'Then run the checks again. The old results describe the old base.',
  ];
  if (report.verdict === 'warn') {
    return [
      '',
      `Within the allowance of ${String(maxBehind)}, but the base changed files this branch changes.`,
      'Update the branch before you trust local checks:',
      ...update,
    ];
  }
  const reason =
    behind > maxBehind
      ? `${plural(behind, 'commit')} behind, ${String(maxBehind)} allowed.`
      : `The merge with ${base.ref} conflicts.`;
  return ['', `${reason} Update the branch:`, ...update];
}

export function formatReport(report: Report): string {
  const { base, head, mergeBase } = report;
  const dryRun = report.dryRun ? '  (dry run: exit code stays 0)' : '';
  const freshness = report.fetched
    ? `  ${base.ref} fetched just now`
    : `  ${base.ref} as of the last fetch. Pass --fetch to update it first`;
  const output = [
    `stale-base: ${report.verdict.toUpperCase()}${dryRun}`,
    `  ${head.ref} is ${plural(report.behind, 'commit')} behind ${base.ref} and ${String(report.ahead)} ahead`,
    `  merge base ${mergeBase.sha.slice(0, 7)}, committed ${mergeBase.date.slice(0, 10)}, ${plural(mergeBase.ageDays, 'day')} ago`,
    mergeLine(report),
    freshness,
    ...overlapTable(report),
    ...advice(report),
  ];
  return `${output.join('\n')}\n`;
}
