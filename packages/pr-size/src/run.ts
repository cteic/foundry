import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  loadConfig,
  resolveOptions,
  toCount,
  toFraction,
  UsageError,
  type Config,
} from './config.ts';
import { diffNumstat, GitError, linguistGenerated, repoRoot, resolveBase } from './git.ts';
import { formatReport, type Report } from './report.ts';
import {
  decideVerdict,
  groupByDirectory,
  parseNumstat,
  partitionChanges,
  sumLines,
} from './size.ts';

export interface Io {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export const exitCode = { pass: 0, tooBig: 1, error: 2 } as const;

const help = `pr-size: fail when a change is too big to review

Usage: pr-size [options]

Options:
  --base <ref>         Ref to compare with. Default: origin/HEAD
  --max-lines <n>      Most changed lines allowed. Default: 400
  --max-files <n>      Most changed files allowed. Default: 25
  --warn-at <0-1>      Fraction of a limit that triggers a warning. Default: 0.8
  --exclude <glob>     Do not count matching paths. Repeatable
  --include-generated  Count lockfiles, snapshots, dist, vendor, minified files and images
  --json               Print the report as JSON
  --dry-run            Report, but always exit 0
  --version            Print the version
  --help               Print this help

Exit codes: 0 pass or warning, 1 over a limit, 2 usage or git error.
Config: .pr-size.json, or a "pr-size" key in package.json. Flags win.
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
        'max-lines': { type: 'string' },
        'max-files': { type: 'string' },
        'warn-at': { type: 'string' },
        exclude: { type: 'string', multiple: true },
        'include-generated': { type: 'boolean' },
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

function buildReport(cwd: string, flags: Config, dryRun: boolean): Report {
  const root = repoRoot(cwd);
  const options = resolveOptions(flags, loadConfig(root));
  const base = resolveBase(root, options.base);
  const changes = parseNumstat(diffNumstat(root, base.sha));
  const { counted, excluded } = partitionChanges(changes, {
    exclude: options.exclude,
    includeGenerated: options.includeGenerated,
    linguistGenerated: options.includeGenerated
      ? new Set()
      : linguistGenerated(
          root,
          changes.map((change) => change.path)
        ),
  });
  const lines = sumLines(counted);
  return {
    verdict: decideVerdict(lines, counted.length, options.limits),
    dryRun,
    lines,
    files: counted.length,
    limits: options.limits,
    base,
    counted,
    excluded,
    groups: groupByDirectory(counted),
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
    const maxLines = values['max-lines'];
    const maxFiles = values['max-files'];
    const warnAt = values['warn-at'];
    const flags: Config = {
      base: values.base,
      maxLines: maxLines === undefined ? undefined : toCount(maxLines, '--max-lines'),
      maxFiles: maxFiles === undefined ? undefined : toCount(maxFiles, '--max-files'),
      warnAt: warnAt === undefined ? undefined : toFraction(warnAt, '--warn-at'),
      exclude: values.exclude,
      includeGenerated: values['include-generated'],
    };
    const report = buildReport(io.cwd, flags, values['dry-run'] === true);
    io.stdout(values.json === true ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    return report.verdict === 'fail' && !report.dryRun ? exitCode.tooBig : exitCode.pass;
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`pr-size: ${error.message}\nRun pr-size --help for usage.\n`);
      return exitCode.error;
    }
    if (error instanceof GitError) {
      io.stderr(`pr-size: git failed: ${error.message}\n`);
      return exitCode.error;
    }
    throw error;
  }
}
