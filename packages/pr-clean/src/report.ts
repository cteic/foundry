import type { Base } from './git.ts';
import type { Finding, Location, RuleName } from './rules.ts';

export type RuleStatus = 'pass' | 'fail' | 'skipped';

export interface RuleResult {
  rule: RuleName;
  status: RuleStatus;
  findings: Finding[];
}

export interface Report {
  verdict: 'pass' | 'fail';
  dryRun: boolean;
  base: Base;
  commits: number;
  rules: RuleResult[];
}

const fixes: Record<RuleName, string[]> = {
  author: [
    'Set your identity, then rewrite the commits with it:',
    '  git config user.name "<name>" && git config user.email "<email>"',
    "  git rebase <base> --exec 'git commit --amend --no-edit --reset-author'",
  ],
  trailers: ['Reword the commits and delete those lines:', '  git rebase --interactive <base>'],
  attribution: [
    'Delete the credit lines. If a line is real product text, end it with a',
    'comment that holds pr-clean-allow, or list the file under "ignore".',
  ],
  'em-dash': ['Use a colon, a full stop or commas instead of the em dash (U+2014).'],
};

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function place(location: Location): string {
  if (location.kind === 'commit') {
    return location.commit.slice(0, 7);
  }
  if (location.kind === 'file') {
    return `${location.path}:${String(location.line)}`;
  }
  return `PR body:${String(location.line)}`;
}

function summaryRow(result: RuleResult): string {
  const count = result.status === 'fail' ? `  ${plural(result.findings.length, 'finding')}` : '';
  return `  ${result.rule.padEnd(12)} ${result.status}${count}`;
}

function details(result: RuleResult): string[] {
  const rows = result.findings.flatMap((finding) => [
    `  ${place(finding.location)}  ${finding.check}: ${finding.message}`,
    `      ${finding.excerpt}`,
  ]);
  return ['', result.rule, ...rows, ...fixes[result.rule].map((line) => `  ${line}`)];
}

export function formatReport(report: Report): string {
  const dryRun = report.dryRun ? '  (dry run: exit code stays 0)' : '';
  const output = [
    `pr-clean: ${report.verdict.toUpperCase()}${dryRun}`,
    `  ${plural(report.commits, 'commit')} checked against ${report.base.ref} (${report.base.sha.slice(0, 7)})`,
    '',
    ...report.rules.map(summaryRow),
    ...report.rules.filter((result) => result.status === 'fail').flatMap(details),
  ];
  return `${output.join('\n')}\n`;
}
