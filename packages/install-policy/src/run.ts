import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { checkPackageManager, checkWorkspace, type Finding } from './policy.ts';

export interface Io {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface Report {
  root: string;
  pass: boolean;
  findings: Finding[];
}

export const exitCode = { pass: 0, drift: 1, error: 2 } as const;

const help = `install-policy: fail when pnpm install settings drift from the cteic baseline

Usage: install-policy [options]

Options:
  --root <dir>   Repo root that holds pnpm-workspace.yaml. Default: the current directory
  --json         Print the report as JSON
  --version      Print the version
  --help         Print this help

Exit codes: 0 pass, 1 drift from the baseline, 2 usage error or unreadable file.
`;

class UsageError extends Error {}

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
        root: { type: 'string' },
        json: { type: 'boolean' },
        version: { type: 'boolean' },
        help: { type: 'boolean' },
      },
    }).values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

function readRequired(path: string, name: string): string {
  if (!existsSync(path)) {
    throw new UsageError(`${name} not found at ${path}.`);
  }
  return readFileSync(path, 'utf8');
}

export function buildReport(root: string): Report {
  const workspace = readRequired(join(root, 'pnpm-workspace.yaml'), 'pnpm-workspace.yaml');
  const manifestText = readRequired(join(root, 'package.json'), 'package.json');
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new UsageError('package.json is not valid JSON.');
  }
  const findings = [...checkWorkspace(workspace), ...checkPackageManager(manifest)];
  return { root, pass: findings.length === 0, findings };
}

export function formatReport(report: Report): string {
  if (report.pass) {
    return 'install-policy: pass. pnpm install settings match the baseline.\n';
  }
  const lines = report.findings.map((finding) => `  ${finding.setting}: ${finding.message}`);
  return `install-policy: ${String(report.findings.length)} setting(s) drift from the baseline\n${lines.join('\n')}\nSee https://github.com/cteic/foundry/blob/dev/docs/install-policy.md\n`;
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
    const root = values.root === undefined ? io.cwd : resolve(io.cwd, values.root);
    const report = buildReport(root);
    io.stdout(values.json === true ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    return report.pass ? exitCode.pass : exitCode.drift;
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`install-policy: ${error.message}\nRun install-policy --help for usage.\n`);
      return exitCode.error;
    }
    throw error;
  }
}
