import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { loadConfig, resolveOptions, UsageError, type Config, type Options } from './config.ts';
import { parseAddedLines } from './diff.ts';
import { diffAddedLines, GitError, listCommits, repoRoot, resolveBase } from './git.ts';
import { formatReport, type Report, type RuleResult } from './report.ts';
import {
  checkAttribution,
  checkAuthors,
  checkEmDash,
  checkTrailers,
  dropIgnored,
  ruleNames,
  type Finding,
  type RuleName,
} from './rules.ts';

export interface Io {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export const exitCode = { pass: 0, findings: 1, error: 2 } as const;

const help = `pr-clean: check a branch before its pull request goes public

Usage: pr-clean [options]

Rules:
  author       Every commit's author and committer is on the allowed list
  trailers     No co-author trailers or tool credit lines in commit messages
  attribution  No tool credit lines in added lines or in the PR body
  em-dash      No em dash in added prose lines, commit messages or the PR body

Options:
  --base <ref>              Ref to compare with. Default: origin/HEAD
  --allow-author <author>   Allowed "Name <email>". Repeatable
  --skip <rule>             Turn a rule off. Repeatable
  --pr-body-file <path>     Also check the PR body in this file
  --ignore <glob>           Skip matching paths in attribution and em-dash. Repeatable
  --em-dash-files <glob>    Files the em-dash rule reads. Repeatable. Default: *.md *.mdx *.txt
  --json                    Print the report as JSON
  --dry-run                 Report, but always exit 0
  --version                 Print the version
  --help                    Print this help

Exit codes: 0 clean, 1 findings, 2 usage or git error.
Config: .pr-clean.json, or a "pr-clean" key in package.json. Flags win.
`;

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

function version(): string {
  const manifest: unknown = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
  if (typeof manifest === 'object' && manifest !== null && 'version' in manifest) {
    return String(manifest.version);
  }
  return 'unknown';
}

export function ownFiles(root: string, toolDir: string): string[] {
  const inside = relative(root, toolDir).replaceAll('\\', '/');
  if (inside.startsWith('..') || isAbsolute(inside)) {
    return [];
  }
  const prefix = inside === '' ? '' : `${inside}/`;
  return [`${prefix}src/patterns.ts`, `${prefix}src/**/*.test.ts`];
}

function parseFlags(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        base: { type: 'string' },
        'allow-author': { type: 'string', multiple: true },
        skip: { type: 'string', multiple: true },
        'pr-body-file': { type: 'string' },
        ignore: { type: 'string', multiple: true },
        'em-dash-files': { type: 'string', multiple: true },
        json: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        version: { type: 'boolean' },
        help: { type: 'boolean' },
      },
    }).values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

function readBody(cwd: string, path: string | undefined): string | undefined {
  if (path === undefined) {
    return undefined;
  }
  try {
    return readFileSync(resolve(cwd, path), 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UsageError(`Cannot read the PR body file: ${reason}`);
  }
}

function buildReport(
  root: string,
  options: Options,
  prBody: string | undefined,
  dryRun: boolean
): Report {
  const base = resolveBase(root, options.base);
  const commits = listCommits(root, base);
  const lines = dropIgnored(parseAddedLines(diffAddedLines(root, base)), [
    ...options.ignore,
    ...ownFiles(realpathSync(root), realpathSync(packageDir)),
  ]);
  const checks: Record<RuleName, () => Finding[]> = {
    author: () => checkAuthors(commits, options.allowAuthors),
    trailers: () => checkTrailers(commits),
    attribution: () => checkAttribution(lines, prBody),
    'em-dash': () => checkEmDash(commits, lines, prBody, options.emDashFiles),
  };
  const rules = ruleNames.map((rule): RuleResult => {
    if (options.skip.includes(rule)) {
      return { rule, status: 'skipped', findings: [] };
    }
    const findings = checks[rule]();
    return { rule, status: findings.length === 0 ? 'pass' : 'fail', findings };
  });
  return {
    verdict: rules.some((result) => result.status === 'fail') ? 'fail' : 'pass',
    dryRun,
    base,
    commits: commits.length,
    rules,
  };
}

export function run(argv: string[], io: Io): number {
  try {
    const values = parseFlags(argv);
    if (values.help === true) {
      io.stdout(help);
      return exitCode.pass;
    }
    if (values.version === true) {
      io.stdout(`${version()}\n`);
      return exitCode.pass;
    }
    const flags: Config = {
      base: values.base,
      allowAuthors: values['allow-author'],
      skip: values.skip,
      ignore: values.ignore,
      emDashFiles: values['em-dash-files'],
    };
    const root = repoRoot(io.cwd);
    const options = resolveOptions(flags, loadConfig(root));
    const prBody = readBody(io.cwd, values['pr-body-file']);
    const report = buildReport(root, options, prBody, values['dry-run'] === true);
    io.stdout(values.json === true ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    return report.verdict === 'fail' && !report.dryRun ? exitCode.findings : exitCode.pass;
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`pr-clean: ${error.message}\nRun pr-clean --help for usage.\n`);
      return exitCode.error;
    }
    if (error instanceof GitError) {
      io.stderr(`pr-clean: git failed: ${error.message}\n`);
      return exitCode.error;
    }
    throw error;
  }
}
