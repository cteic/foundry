import { execFileSync } from 'node:child_process';

import { parseLog, type Commit } from './commits.ts';

export class GitError extends Error {}

export interface Base {
  ref: string;
  sha: string;
}

const logFormat = ['%H', '%P', '%s', '%b'].join('%x1f');

function stderrOf(error: unknown): string {
  if (error instanceof Error && 'stderr' in error && typeof error.stderr === 'string') {
    return error.stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

export function git(cwd: string, args: readonly string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new GitError(stderrOf(error));
  }
}

export function repoRoot(cwd: string): string {
  try {
    return git(cwd, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    throw new GitError(`Not a git repository: ${cwd}`);
  }
}

export function assertFullHistory(cwd: string): void {
  if (git(cwd, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new GitError(
      'This is a shallow clone, so commits on the branch can be missing. Fetch full history: git fetch --unshallow (fetch-depth: 0 in actions/checkout).'
    );
  }
}

export function resolveBase(cwd: string, requested: string | undefined): Base {
  const ref = requested ?? 'origin/HEAD';
  try {
    git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    const hint =
      requested === undefined
        ? 'Pass --base <ref>, or run: git remote set-head origin --auto'
        : 'Fetch it first, or pass another --base <ref>.';
    throw new GitError(`Cannot find the base ref "${ref}". ${hint}`);
  }
  try {
    return { ref, sha: git(cwd, ['merge-base', ref, 'HEAD']).trim() };
  } catch {
    throw new GitError(`No common ancestor between "${ref}" and HEAD.`);
  }
}

function parsePaths(output: string): string[] {
  return output.split('\0').filter((path) => path !== '');
}

export function listCommits(cwd: string, base: Base): Commit[] {
  return parseLog(
    git(cwd, ['log', '-z', '--reverse', `--format=${logFormat}`, `${base.ref}..HEAD`])
  );
}

export function changedFiles(cwd: string, base: Base): string[] {
  return parsePaths(
    git(cwd, [
      'diff',
      '--name-only',
      '-z',
      '--no-renames',
      '--no-ext-diff',
      '--diff-filter=d',
      base.sha,
      'HEAD',
    ])
  );
}

export function commitFiles(cwd: string, hash: string): string[] {
  return parsePaths(
    git(cwd, [
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '--no-renames',
      '-r',
      '-z',
      '--root',
      hash,
    ])
  );
}

export function diffRustFiles(cwd: string, base: Base): string {
  return git(cwd, [
    '-c',
    'core.quotepath=off',
    'diff',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--no-renames',
    '--diff-filter=d',
    '--src-prefix=a/',
    '--dst-prefix=b/',
    base.sha,
    'HEAD',
    '--',
    '*.rs',
  ]);
}
