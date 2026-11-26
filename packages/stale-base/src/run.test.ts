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
  behind: number;
  ahead: number;
  fetched: boolean;
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  mergeBase: { sha: string; date: string; ageDays: number };
  merge: { status: string; conflicts: string[] };
  overlap: { path: string; conflict: boolean }[];
}

let sandbox = '';
let upstream = '';
let repo = '';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Test Author',
      GIT_AUTHOR_EMAIL: 'author@example.com',
      GIT_AUTHOR_DATE: '2026-01-01T12:00:00Z',
      GIT_COMMITTER_NAME: 'Test Author',
      GIT_COMMITTER_EMAIL: 'author@example.com',
      GIT_COMMITTER_DATE: '2026-01-01T12:00:00Z',
    },
  }).trim();
}

function commit(cwd: string, path: string, content: string, message: string): void {
  const file = join(cwd, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  git(cwd, 'add', '--all');
  git(cwd, 'commit', '--quiet', '--message', message);
}

function staleBaseIn(cwd: string, ...argv: string[]): Result {
  let stdout = '';
  let stderr = '';
  const code = run(argv, {
    cwd,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    now: () => new Date('2026-01-11T12:00:00Z'),
  });
  return { code, stdout, stderr };
}

function staleBase(...argv: string[]): Result {
  return staleBaseIn(repo, ...argv);
}

function isJsonReport(value: unknown): value is JsonReport {
  return typeof value === 'object' && value !== null && 'verdict' in value && 'overlap' in value;
}

function jsonReport(result: Result): JsonReport {
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isJsonReport(parsed)) {
    throw new Error(`Not a report: ${result.stdout}${result.stderr}`);
  }
  return parsed;
}

function landOnBase(path: string, content: string): void {
  commit(upstream, path, content, `feat: change ${path} on the base`);
  git(repo, 'fetch', '--quiet', 'origin');
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'stale-base-'));
  upstream = join(sandbox, 'upstream');
  repo = join(sandbox, 'repo');
  mkdirSync(upstream);
  git(upstream, 'init', '--quiet', '--initial-branch', 'trunk');
  commit(upstream, 'src/shared.ts', 'one\ntwo\nthree\n', 'chore: initial commit');
  git(sandbox, 'clone', '--quiet', upstream, repo);
  git(repo, 'switch', '--quiet', '--create', 'feat/change');
  commit(repo, 'src/mine.ts', 'mine\n', 'feat: add my file');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('stale-base in a real repository', () => {
  it('passes a branch that holds every commit of the default base', () => {
    const result = staleBase('--json');
    const report = jsonReport(result);

    expect(result.code).toBe(0);
    expect(report).toMatchObject({
      verdict: 'pass',
      behind: 0,
      ahead: 1,
      fetched: false,
      base: { ref: 'origin/trunk' },
      head: { ref: 'feat/change' },
      mergeBase: { date: '2026-01-01T12:00:00.000Z', ageDays: 10 },
      merge: { status: 'clean', conflicts: [] },
      overlap: [],
    });
    expect(report.mergeBase.sha).toBe(report.base.sha);
  });

  it('exits 1 when the base has moved, and says how to update', () => {
    landOnBase('src/other.ts', 'other\n');
    const result = staleBase();

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('stale-base: FAIL');
    expect(result.stdout).toContain('feat/change is 1 commit behind origin/trunk and 1 ahead');
    expect(result.stdout).toContain('committed 2026-01-01, 10 days ago');
    expect(result.stdout).toContain('merge with origin/trunk: clean');
    expect(result.stdout).toContain('1 commit behind, 0 allowed. Update the branch:');
    expect(result.stdout).toContain('git rebase origin/trunk');
  });

  it('does not see a base commit it has not fetched, and sees it with --fetch', () => {
    commit(upstream, 'src/other.ts', 'other\n', 'feat: land work on the base');

    expect(jsonReport(staleBase('--json'))).toMatchObject({ behind: 0, fetched: false });

    const result = staleBase('--fetch', '--json');

    expect(result.code).toBe(1);
    expect(jsonReport(result)).toMatchObject({ behind: 1, fetched: true });
  });

  it('allows a branch behind by no more than --max-behind', () => {
    landOnBase('src/other.ts', 'other\n');

    expect(staleBase('--max-behind', '1').code).toBe(0);
    expect(staleBase('--max-behind', '1').stdout).toContain('stale-base: PASS');
  });

  it('warns inside the allowance when the base changed a file the branch changes', () => {
    commit(repo, 'src/shared.ts', 'one\ntwo\nthree\nfour\n', 'feat: add a line at the end');
    landOnBase('src/shared.ts', 'zero\none\ntwo\nthree\n');
    const result = staleBase('--max-behind', '5');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('stale-base: WARN');
    expect(result.stdout).toContain(
      'Changed on origin/trunk since the merge base, and also changed on this branch:\n  src/shared.ts\n'
    );
    expect(jsonReport(staleBase('--max-behind', '5', '--json'))).toMatchObject({
      merge: { status: 'clean' },
      overlap: [{ path: 'src/shared.ts', conflict: false }],
    });
  });

  it('exits 1 inside the allowance when the merge would conflict', () => {
    commit(repo, 'src/shared.ts', 'one\nmine\nthree\n', 'feat: change line two');
    landOnBase('src/shared.ts', 'one\ntheirs\nthree\n');
    const result = staleBase('--max-behind', '5');

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('merge with origin/trunk: conflict in 1 file');
    expect(result.stdout).toContain('  src/shared.ts  (conflict)');
    expect(result.stdout).toContain('The merge with origin/trunk conflicts. Update the branch:');
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('exits 0 when stale with --dry-run, and still reports the failure', () => {
    landOnBase('src/other.ts', 'other\n');
    const result = staleBase('--dry-run');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('stale-base: FAIL  (dry run: exit code stays 0)');
  });

  it('compares with another ref when given --base', () => {
    git(repo, 'branch', 'release', 'origin/trunk');
    landOnBase('src/other.ts', 'other\n');

    expect(jsonReport(staleBase('--base', 'release', '--json'))).toMatchObject({
      verdict: 'pass',
      base: { ref: 'release' },
    });
  });

  it('works in a linked worktree, on that worktree branch', () => {
    const linked = join(sandbox, 'linked');
    git(repo, 'worktree', 'add', '--quiet', '-b', 'feat/linked', linked, 'origin/trunk');
    commit(linked, 'src/linked.ts', 'linked\n', 'feat: add a file in the worktree');
    landOnBase('src/other.ts', 'other\n');
    const result = staleBaseIn(join(linked, 'src'), '--json');

    expect(result.code).toBe(1);
    expect(jsonReport(result)).toMatchObject({
      behind: 1,
      ahead: 1,
      head: { ref: 'feat/linked' },
    });
  });

  it('reports HEAD when the checkout is detached', () => {
    git(repo, 'switch', '--quiet', '--detach');

    expect(jsonReport(staleBase('--json'))).toMatchObject({ head: { ref: 'HEAD' }, ahead: 1 });
  });

  it('exits 2 in a shallow clone and says how to fetch history', () => {
    commit(upstream, 'src/other.ts', 'other\n', 'feat: second commit');
    const shallow = join(sandbox, 'shallow');
    git(sandbox, 'clone', '--quiet', '--depth', '1', `file://${upstream}`, shallow);
    const result = staleBaseIn(shallow);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('This is a shallow clone');
    expect(result.stderr).toContain('git fetch --unshallow');
  });

  it('reads the config file, and a flag beats it', () => {
    landOnBase('src/other.ts', 'other\n');
    writeFileSync(join(repo, '.stale-base.json'), JSON.stringify({ maxBehind: 3 }));

    expect(staleBase().code).toBe(0);
    expect(staleBase('--max-behind', '0').code).toBe(1);
  });

  it('reads the stale-base key in package.json', () => {
    landOnBase('src/other.ts', 'other\n');
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify({ name: 'x', 'stale-base': { maxBehind: 3 } })
    );

    expect(staleBase().code).toBe(0);
  });

  it('exits 2 when origin/HEAD is not set, and never guesses a branch', () => {
    git(repo, 'remote', 'set-head', 'origin', '--delete');
    const result = staleBase();

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Cannot find the base ref "origin/HEAD"');
    expect(result.stderr).toContain('git remote set-head origin --auto');
  });

  it('exits 2 when the base ref does not exist', () => {
    const result = staleBase('--base', 'origin/nope');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Cannot find the base ref "origin/nope"');
  });

  it('exits 2 when --fetch is given a base that is on no remote', () => {
    git(repo, 'branch', 'release', 'origin/trunk');
    const result = staleBase('--base', 'release', '--fetch');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--fetch needs a base on a remote');
  });

  it('exits 2 when the fetch fails', () => {
    rmSync(upstream, { recursive: true, force: true });
    const result = staleBase('--fetch');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Cannot fetch from "origin"');
  });

  it('exits 2 when the base shares no history with the branch', () => {
    git(repo, 'switch', '--quiet', '--orphan', 'island');
    commit(repo, 'island.ts', 'island\n', 'chore: start again');
    const result = staleBase();

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('No common ancestor between "origin/trunk" and island');
  });

  it('exits 2 on an unknown flag, a bad number and a bad config file', () => {
    expect(staleBase('--nope').code).toBe(2);
    expect(staleBase('--max-behind', 'many').code).toBe(2);
    writeFileSync(join(repo, '.stale-base.json'), '{ not json');
    expect(staleBase().code).toBe(2);
  });

  it('exits 2 outside a git repository', () => {
    const outside = mkdtempSync(join(tmpdir(), 'stale-base-none-'));
    const result = staleBaseIn(outside);
    rmSync(outside, { recursive: true, force: true });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Not a git repository');
  });

  it('prints help and exits 0', () => {
    const result = staleBase('--help');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: stale-base [options]');
  });
});
