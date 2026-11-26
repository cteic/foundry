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
  commits: number;
  fixes: { subject: string; status: string; note: string }[];
  ignored: { subject: string; reason: string }[];
  testFiles: { path: string; reason: string }[];
}

let sandbox = '';
let repo = '';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, {
    cwd,
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

function commitIn(cwd: string, files: Record<string, string>, ...message: string[]): void {
  for (const [path, content] of Object.entries(files)) {
    const file = join(cwd, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  git(cwd, 'add', '--all');
  git(cwd, 'commit', '--quiet', ...message.flatMap((paragraph) => ['--message', paragraph]));
}

function commit(files: Record<string, string>, ...message: string[]): void {
  commitIn(repo, files, ...message);
}

function fixHasTestIn(cwd: string, ...argv: string[]): Result {
  let stdout = '';
  let stderr = '';
  const code = run(argv, {
    cwd,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { code, stdout, stderr };
}

function fixHasTest(...argv: string[]): Result {
  return fixHasTestIn(repo, '--base', 'main', ...argv);
}

function isJsonReport(value: unknown): value is JsonReport {
  return typeof value === 'object' && value !== null && 'verdict' in value && 'fixes' in value;
}

function jsonReport(result: Result): JsonReport {
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isJsonReport(parsed)) {
    throw new Error(`Not a report: ${result.stdout}${result.stderr}`);
  }
  return parsed;
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'fix-has-test-'));
  repo = join(sandbox, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '--quiet', '--initial-branch', 'main');
  commit(
    {
      'src/export.ts': 'export const rows = 1;\n',
      'src/export.test.ts': 'old test\n',
      'src/lib.rs': 'pub fn parse() {}\n',
      'package.json': '{ "name": "x" }\n',
    },
    'chore: initial commit'
  );
  git(repo, 'switch', '--quiet', '--create', 'fix/export');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('fix-has-test in a real repository', () => {
  it('exits 1 when a fix commit ships with no test change', () => {
    commit({ 'src/export.ts': 'export const rows = 2;\n' }, 'fix(web): count every row');
    const result = fixHasTest();

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('fix-has-test: FAIL');
    expect(result.stdout).toContain('1 commit needs a test, and the branch changes no test file');
    expect(result.stdout).toMatch(/Needs a test\n {2}[0-9a-f]{7} {2}fix\(web\): count every row/);
    expect(result.stdout).toContain('No-test: <reason>');
  });

  it('passes when another commit on the branch changes a test file', () => {
    commit({ 'src/export.ts': 'export const rows = 2;\n' }, 'fix!: count every row');
    commit({ 'src/export.test.ts': 'new test\n' }, 'test: cover the row count');
    const result = fixHasTest('--json');

    expect(result.code).toBe(0);
    expect(jsonReport(result)).toMatchObject({
      verdict: 'pass',
      commits: 2,
      fixes: [{ subject: 'fix!: count every row', status: 'needs-test' }],
      testFiles: [{ path: 'src/export.test.ts', reason: 'matches *.test.*' }],
    });
  });

  it('passes a branch with no fix commit', () => {
    commit({ 'src/export.ts': 'export const rows = 2;\n' }, 'feat(web): add a row');
    const result = fixHasTest();

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('no fix commit needs a test');
  });

  it('does not count a deleted test file or a snapshot as a test change', () => {
    commit({ 'src/export.test.ts.snap': 'snapshot\n' }, 'fix: count every row');
    git(repo, 'rm', '--quiet', 'src/export.test.ts');
    git(repo, 'commit', '--quiet', '--message', 'chore: drop the old test');
    const result = fixHasTest('--json');

    expect(result.code).toBe(1);
    expect(jsonReport(result).testFiles).toEqual([]);
  });

  it('waives a fix with a No-test reason, and prints the reason', () => {
    commit(
      { '.github/workflows/ci.yml': 'runs-on: ubuntu-24.04\n' },
      'fix(ci): pin the runner image',
      'The default image moved.',
      'No-test: workflow file only, nothing to assert'
    );
    const result = fixHasTest();

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Waived by a No-test line in the commit body');
    expect(result.stdout).toContain('No-test: workflow file only, nothing to assert');
  });

  it('still fails when one fix is waived and another is not', () => {
    commit({ 'a.yml': 'a\n' }, 'fix(ci): pin the runner image', 'No-test: workflow file only');
    commit({ 'src/export.ts': 'export const rows = 2;\n' }, 'fix(web): count every row');

    expect(fixHasTest().code).toBe(1);
  });

  it('exempts a dependency fix that changes dependency files only', () => {
    commit({ 'package.json': '{ "name": "x", "version": "2" }\n' }, 'fix(deps): update zod');
    const result = fixHasTest();

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Exempt\n');
    expect(result.stdout).toContain('scope deps, dependency files only');
  });

  it('fails a dependency fix that also changes source', () => {
    commit(
      { 'package.json': '{ "name": "x", "version": "2" }\n', 'src/export.ts': 'changed\n' },
      'fix(deps): update zod and adapt the export'
    );
    const result = fixHasTest();

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('scope deps, but it also changes src/export.ts');
  });

  it('fails a dependency fix when --exempt-scopes is empty', () => {
    commit({ 'package.json': '{ "name": "x", "version": "2" }\n' }, 'fix(deps): update zod');

    expect(fixHasTest('--exempt-scopes', '').code).toBe(1);
  });

  it('ignores a revert and a merge commit', () => {
    commit({ 'src/export.ts': 'export const rows = 2;\n' }, 'Revert "fix(web): count rows"');
    git(repo, 'switch', '--quiet', '--create', 'side', 'main');
    commit({ 'side.ts': 'side\n' }, 'feat: add a side file');
    git(repo, 'switch', '--quiet', 'fix/export');
    git(repo, 'merge', '--quiet', '--no-ff', '--message', 'fix: merge side into the fix', 'side');
    const result = fixHasTest('--json');

    expect(result.code).toBe(0);
    expect(jsonReport(result)).toMatchObject({
      fixes: [],
      ignored: [
        { subject: 'Revert "fix(web): count rows"', reason: 'revert' },
        { subject: 'fix: merge side into the fix', reason: 'merge' },
      ],
    });
  });

  it('checks other types with --types', () => {
    commit({ 'src/export.ts': 'export const rows = 2;\n' }, 'perf(web): cache the rows');

    expect(fixHasTest().code).toBe(0);
    expect(fixHasTest('--types', 'fix,perf').code).toBe(1);
  });

  it('uses the globs from --test-globs in place of the defaults', () => {
    commit(
      { 'src/export.ts': 'export const rows = 2;\n', 'src/export_check.ts': 'check\n' },
      'fix(web): count every row'
    );

    expect(fixHasTest().code).toBe(1);
    expect(fixHasTest('--test-globs', '*_check.ts,*_test.go').code).toBe(0);
  });

  it('counts a Rust file that gains a #[test] function', () => {
    commit(
      {
        'src/lib.rs':
          'pub fn parse() {}\n\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn parses() {}\n}\n',
      },
      'fix(core): parse the empty input'
    );
    const result = fixHasTest('--json');

    expect(result.code).toBe(0);
    expect(jsonReport(result).testFiles).toEqual([
      { path: 'src/lib.rs', reason: 'adds a Rust #[test]' },
    ]);
  });

  it('does not count a Rust change with no new #[test]', () => {
    commit({ 'src/lib.rs': 'pub fn parse() -> u8 { 1 }\n' }, 'fix(core): return a value');

    expect(fixHasTest().code).toBe(1);
  });

  it('exits 0 on a failure with --dry-run, and still reports it', () => {
    commit({ 'src/export.ts': 'export const rows = 2;\n' }, 'fix(web): count every row');
    const result = fixHasTest('--dry-run');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('fix-has-test: FAIL  (dry run: exit code stays 0)');
  });

  it('reads the config file, and a flag beats it', () => {
    commit({ 'src/export.ts': 'export const rows = 2;\n' }, 'perf(web): cache the rows');
    writeFileSync(join(repo, '.fix-has-test.json'), JSON.stringify({ types: ['perf'] }));

    expect(fixHasTest().code).toBe(1);
    expect(fixHasTest('--types', 'fix').code).toBe(0);
  });

  it('reads the fix-has-test key in package.json, including the base', () => {
    commit({ 'src/export.ts': 'export const rows = 2;\n' }, 'fix(web): count every row');
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify({ name: 'x', 'fix-has-test': { base: 'main', testGlobs: ['src/**'] } })
    );

    expect(fixHasTestIn(repo).code).toBe(0);
  });

  it('defaults to origin/HEAD and works in a linked worktree of a clone', () => {
    const clone = join(sandbox, 'clone');
    const linked = join(sandbox, 'linked');
    git(sandbox, 'clone', '--quiet', repo, clone);
    git(clone, 'worktree', 'add', '--quiet', '-b', 'fix/linked', linked, 'origin/main');
    commitIn(linked, { 'src/export.ts': 'export const rows = 3;\n' }, 'fix(web): count rows');
    const result = fixHasTestIn(join(linked, 'src'));

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('1 commit checked against origin/HEAD');
  });

  it('exits 2 in a shallow clone and says how to fetch history', () => {
    const shallow = join(sandbox, 'shallow');
    commit({ 'src/export.ts': 'export const rows = 2;\n' }, 'fix(web): count every row');
    git(sandbox, 'clone', '--quiet', '--depth', '1', `file://${repo}`, shallow);
    const result = fixHasTestIn(shallow);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('This is a shallow clone');
    expect(result.stderr).toContain('git fetch --unshallow');
  });

  it('exits 2 when the base ref does not exist', () => {
    const result = fixHasTestIn(repo);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Cannot find the base ref "origin/HEAD"');
    expect(result.stderr).toContain('--base <ref>');
  });

  it('exits 2 on an unknown flag, an empty type list and a bad config file', () => {
    expect(fixHasTest('--nope').code).toBe(2);
    expect(fixHasTest('--types', '').code).toBe(2);
    writeFileSync(join(repo, '.fix-has-test.json'), '{ not json');
    expect(fixHasTest().code).toBe(2);
  });

  it('exits 2 outside a git repository', () => {
    const outside = mkdtempSync(join(tmpdir(), 'fix-has-test-none-'));
    const result = fixHasTestIn(outside);
    rmSync(outside, { recursive: true, force: true });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Not a git repository');
  });

  it('prints help and exits 0', () => {
    const result = fixHasTest('--help');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: fix-has-test [options]');
  });
});
