import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  loadConfig,
  resolveOptions,
  toCount,
  UsageError,
  type Config,
  type Options,
} from './config.ts';
import {
  assertFullHistory,
  changedPaths,
  checkMerge,
  commitDate,
  countCommits,
  fetchBase,
  GitError,
  mergeBase,
  repoRoot,
  resolveBase,
  resolveHead,
} from './git.ts';
import { formatReport, type Report } from './report.ts';
import { ageInDays, decideVerdict, findOverlap, type MergeCheck } from './staleness.ts';

export interface Io {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  now?: () => Date;
}

export const exitCode = { pass: 0, stale: 1, error: 2 } as const;

const help = `stale-base: fail when a branch is built on an old base

Usage: stale-base [options]

Options:
  --base <ref>       Ref the branch must be up to date with. Default: the branch origin/HEAD points to
  --max-behind <n>   Most commits the branch may be behind the base. Default: 0
  --fetch            Fetch the base's remote first. Off by default, so the check works offline
  --json             Print the report as JSON
  --dry-run          Report, but always exit 0
  --version          Print the version
  --help             Print this help

Exit codes: 0 pass or warning, 1 too far behind or the merge conflicts,
2 usage or git error, including a shallow clone.
Config: .stale-base.json, or a "stale-base" key in package.json. Flags win.
`;

function version(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  if (typeof manifest === 'object' && manifest !== null && 'version' in manifest) {
    return String(manifest.version);
  }
  return 'unknown';
}

function parseFlags(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        base: { type: 'string' },
        'max-behind': { type: 'string' },
        fetch: { type: 'boolean' },
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

function buildReport(root: string, options: Options, now: Date, dryRun: boolean): Report {
  assertFullHistory(root);
  if (options.fetch) {
    fetchBase(root, options.base);
  }
  const base = resolveBase(root, options.base);
  const head = resolveHead(root);
  const ancestor = mergeBase(root, base, head);
  const { behind, ahead } = countCommits(root, base, head);
  const ancestorDate = commitDate(root, ancestor);
  const onBase = behind === 0 ? [] : changedPaths(root, ancestor, base.sha);
  const onBranch = ahead === 0 ? [] : changedPaths(root, ancestor, head.sha);
  const merge: MergeCheck =
    behind === 0 || ahead === 0 ? { status: 'clean', conflicts: [] } : checkMerge(root, base, head);
  const overlap = findOverlap(onBase, onBranch, merge.conflicts);
  return {
    verdict: decideVerdict(behind, options.maxBehind, merge.status, overlap.length),
    dryRun,
    behind,
    ahead,
    maxBehind: options.maxBehind,
    fetched: options.fetch,
    base,
    head,
    mergeBase: {
      sha: ancestor,
      date: ancestorDate.toISOString(),
      ageDays: ageInDays(ancestorDate, now),
    },
    merge,
    changedOnBase: onBase.length,
    changedOnBranch: onBranch.length,
    overlap,
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
    const maxBehind = values['max-behind'];
    const flags: Config = {
      base: values.base,
      maxBehind: maxBehind === undefined ? undefined : toCount(maxBehind, '--max-behind'),
      fetch: values.fetch,
    };
    const root = repoRoot(io.cwd);
    const options = resolveOptions(flags, loadConfig(root));
    const now = io.now === undefined ? new Date() : io.now();
    const report = buildReport(root, options, now, values['dry-run'] === true);
    io.stdout(values.json === true ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    return report.verdict === 'fail' && !report.dryRun ? exitCode.stale : exitCode.pass;
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`stale-base: ${error.message}\nRun stale-base --help for usage.\n`);
      return exitCode.error;
    }
    if (error instanceof GitError) {
      io.stderr(`stale-base: git failed: ${error.message}\n`);
      return exitCode.error;
    }
    throw error;
  }
}
