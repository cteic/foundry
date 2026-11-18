import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { run } from './run.ts';

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

interface JsonReport {
  verdict: string;
  lines: number;
  files: number;
  counted: { path: string; lines: number }[];
  excluded: { path: string; reason: string }[];
}

let repo = '';

function git(...args: string[]): void {
  execFileSync('git', args, {
    cwd: repo,
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Test Author',
      GIT_AUTHOR_EMAIL: 'author@example.com',
      GIT_COMMITTER_NAME: 'Test Author',
      GIT_COMMITTER_EMAIL: 'author@example.com',
    },
  });
}

function write(path: string, lineCount: number): void {
  const file = join(repo, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Array.from({ length: lineCount }, (_, i) => `line ${String(i)}\n`).join(''));
}

function commitAll(message: string): void {
  git('add', '--all');
  git('commit', '--quiet', '--message', message);
}

function prSize(...argv: string[]): Result {
  let stdout = '';
  let stderr = '';
  const code = run(argv, {
    cwd: repo,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { code, stdout, stderr };
}

function isJsonReport(value: unknown): value is JsonReport {
  return typeof value === 'object' && value !== null && 'verdict' in value && 'counted' in value;
}

function jsonReport(result: Result): JsonReport {
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isJsonReport(parsed)) {
    throw new Error(`Not a report: ${result.stdout}`);
  }
  return parsed;
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'pr-size-'));
  git('init', '--quiet', '--initial-branch', 'main');
  write('README.md', 3);
  write('.gitattributes', 0);
  writeFileSync(join(repo, '.gitattributes'), 'src/schema.gen.ts linguist-generated=true\n');
  commitAll('chore: initial commit');
  git('switch', '--quiet', '--create', 'feat/change');
  write('src/api/handler.ts', 30);
  write('src/web/page.ts', 12);
  write('src/schema.gen.ts', 500);
  write('pnpm-lock.yaml', 900);
  commitAll('feat: add a handler and a page');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('pr-size in a real repository', () => {
  it('counts the branch against its base and leaves out generated files', () => {
    const result = prSize('--base', 'main', '--json');
    const report = jsonReport(result);

    expect(result.code).toBe(0);
    expect(report).toMatchObject({ verdict: 'pass', lines: 42, files: 2 });
    expect(report.counted.map((file) => file.path)).toEqual([
      'src/api/handler.ts',
      'src/web/page.ts',
    ]);
    expect(report.excluded).toEqual([
      { path: 'pnpm-lock.yaml', lines: 900, reason: 'generated: pnpm-lock.yaml' },
      { path: 'src/schema.gen.ts', lines: 500, reason: 'linguist-generated' },
    ]);
  });

  it('exits 1 over the limit and says how to split by directory', () => {
    const result = prSize('--base', 'main', '--max-lines', '40');

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('pr-size: FAIL');
    expect(result.stdout).toContain('Over the limit by 2 lines');
    expect(result.stdout).toContain('Split it by directory');
    expect(result.stdout).toMatch(/30\s+1\s+src\/api\n\s+12\s+1\s+src\/web/);
  });

  it('exits 0 over the limit with --dry-run, and still reports the failure', () => {
    const result = prSize('--base', 'main', '--max-files', '1', '--dry-run');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('pr-size: FAIL  (dry run: exit code stays 0)');
  });

  it('warns near the limit and exits 0', () => {
    const result = prSize('--base', 'main', '--max-lines', '50');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('pr-size: WARN');
  });

  it('counts generated files with --include-generated', () => {
    const report = jsonReport(
      prSize('--base', 'main', '--include-generated', '--json', '--dry-run')
    );

    expect(report).toMatchObject({ verdict: 'fail', lines: 1442, files: 4 });
  });

  it('drops paths that match --exclude', () => {
    const report = jsonReport(prSize('--base', 'main', '--exclude', 'src/web/**', '--json'));

    expect(report).toMatchObject({ lines: 30, files: 1 });
  });

  it('ignores commits that landed on the base after the branch point', () => {
    git('switch', '--quiet', 'main');
    write('later.ts', 200);
    commitAll('feat: land later work on the base');
    git('switch', '--quiet', 'feat/change');

    expect(jsonReport(prSize('--base', 'main', '--json'))).toMatchObject({ lines: 42, files: 2 });
  });

  it('reads limits from .pr-size.json, and a flag beats the file', () => {
    writeFileSync(join(repo, '.pr-size.json'), JSON.stringify({ maxLines: 10, base: 'main' }));

    expect(prSize().code).toBe(1);
    expect(prSize('--max-lines', '100').code).toBe(0);
  });

  it('reads limits from the pr-size key in package.json', () => {
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify({ name: 'x', 'pr-size': { maxFiles: 1, base: 'main' } })
    );

    expect(prSize().code).toBe(1);
  });

  it('exits 2 when the base ref does not exist', () => {
    const result = prSize();

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Cannot find the base ref "origin/HEAD"');
    expect(result.stderr).toContain('--base <ref>');
  });

  it('exits 2 on an unknown flag, a bad number and a bad config file', () => {
    expect(prSize('--nope').code).toBe(2);
    expect(prSize('--max-lines', 'many').code).toBe(2);
    writeFileSync(join(repo, '.pr-size.json'), '{ not json');
    expect(prSize('--base', 'main').code).toBe(2);
  });

  it('exits 2 outside a git repository', () => {
    const outside = mkdtempSync(join(tmpdir(), 'pr-size-none-'));
    let stderr = '';
    const code = run([], {
      cwd: outside,
      stdout: () => undefined,
      stderr: (text) => (stderr += text),
    });
    rmSync(outside, { recursive: true, force: true });

    expect(code).toBe(2);
    expect(stderr).toContain('Not a git repository');
  });

  it('prints help and exits 0', () => {
    const result = prSize('--help');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: pr-size [options]');
  });
});
