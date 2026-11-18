import { execFileSync } from 'node:child_process';

import type { Commit } from './rules.ts';

export class GitError extends Error {}

export interface Base {
  ref: string;
  sha: string;
}

const fieldSeparator = '\x1f';
const logFormat = ['%H', '%an', '%ae', '%cn', '%ce', '%B'].join('%x1f');

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
    throw new GitError(
      `No common ancestor between "${ref}" and HEAD. A shallow clone causes this: fetch full history (fetch-depth: 0 in actions/checkout).`
    );
  }
}

export function parseLog(output: string): Commit[] {
  return output
    .split('\0')
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [
        hash = '',
        authorName = '',
        authorEmail = '',
        committerName = '',
        committerEmail = '',
      ] = record.split(fieldSeparator);
      const message = record.split(fieldSeparator).slice(5).join(fieldSeparator).trimEnd();
      return { hash: hash.trim(), authorName, authorEmail, committerName, committerEmail, message };
    });
}

export function listCommits(cwd: string, base: Base): Commit[] {
  return parseLog(
    git(cwd, ['log', '-z', '--reverse', `--format=${logFormat}`, `${base.ref}..HEAD`])
  );
}

export function diffAddedLines(cwd: string, base: Base): string {
  return git(cwd, [
    '-c',
    'core.quotepath=off',
    'diff',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '-M',
    '--src-prefix=a/',
    '--dst-prefix=b/',
    base.sha,
    'HEAD',
  ]);
}
