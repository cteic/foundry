import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { classifyCommits } from './commits.ts';
import {
  loadConfig,
  resolveOptions,
  splitList,
  UsageError,
  type Config,
  type Options,
} from './config.ts';
import { parseAddedLines } from './diff.ts';
import {
  assertFullHistory,
  changedFiles,
  commitFiles,
  diffRustFiles,
  GitError,
  listCommits,
  repoRoot,
  resolveBase,
} from './git.ts';
import { formatReport, type Report } from './report.ts';
import { findRustTests, findTestFiles, mergeTestFiles } from './test-files.ts';

export interface Io {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export const exitCode = { pass: 0, missingTest: 1, error: 2 } as const;

const help = `fix-has-test: fail when a fix commit ships with no test change

Usage: fix-has-test [options]

Options:
  --base <ref>             Ref to compare with. Default: origin/HEAD
  --types <list>           Commit types that need a test, comma separated. Default: fix
  --test-globs <list>      Globs that mark a test file, comma separated. Repeatable.
                           Default: *.test.* *.spec.* *.feature **/__tests__/** **/tests/**
  --exempt-scopes <list>   Scopes exempt when the commit changes dependency files only,
                           comma separated. Default: deps. Pass '' for none
  --json                   Print the report as JSON
  --dry-run                Report, but always exit 0
  --version                Print the version
  --help                   Print this help

Waive one commit with a line in its body: No-test: <reason>
Exit codes: 0 pass, 1 a fix commit and no test change, 2 usage or git error.
Config: .fix-has-test.json, or a "fix-has-test" key in package.json. Flags win.
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
        types: { type: 'string', multiple: true },
        'test-globs': { type: 'string', multiple: true },
        'exempt-scopes': { type: 'string', multiple: true },
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

function buildReport(root: string, options: Options, dryRun: boolean): Report {
  assertFullHistory(root);
  const base = resolveBase(root, options.base);
  const commits = listCommits(root, base);
  const { fixes, ignored } = classifyCommits(commits, {
    types: options.types,
    exemptScopes: options.exemptScopes,
    filesOf: (hash) => commitFiles(root, hash),
  });
  const testFiles = mergeTestFiles(
    findTestFiles(changedFiles(root, base), options.testGlobs),
    findRustTests(parseAddedLines(diffRustFiles(root, base)))
  );
  const needsTest = fixes.some((fix) => fix.status === 'needs-test');
  return {
    verdict: needsTest && testFiles.length === 0 ? 'fail' : 'pass',
    dryRun,
    base,
    commits: commits.length,
    types: options.types,
    fixes,
    ignored,
    testFiles,
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
      types: splitList(values.types),
      testGlobs: splitList(values['test-globs']),
      exemptScopes: splitList(values['exempt-scopes']),
    };
    const root = repoRoot(io.cwd);
    const options = resolveOptions(flags, loadConfig(root));
    const report = buildReport(root, options, values['dry-run'] === true);
    io.stdout(values.json === true ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    return report.verdict === 'fail' && !report.dryRun ? exitCode.missingTest : exitCode.pass;
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`fix-has-test: ${error.message}\nRun fix-has-test --help for usage.\n`);
      return exitCode.error;
    }
    if (error instanceof GitError) {
      io.stderr(`fix-has-test: git failed: ${error.message}\n`);
      return exitCode.error;
    }
    throw error;
  }
}
