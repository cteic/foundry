import { execFileSync, spawnSync } from 'node:child_process';

import {
  parseCounts,
  parseMergeTree,
  parsePaths,
  type Counts,
  type MergeCheck,
} from './staleness.ts';

export class GitError extends Error {}

export interface Ref {
  ref: string;
  sha: string;
}

const maxBuffer = 512 * 1024 * 1024;

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
      maxBuffer,
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
      'This is a shallow clone, so the merge base and the commit counts cannot be trusted. Fetch full history: git fetch --unshallow (fetch-depth: 0 in actions/checkout).'
    );
  }
}

export function remoteOf(ref: string, remotes: readonly string[]): string | undefined {
  const name = ref.startsWith('refs/remotes/') ? ref.slice('refs/remotes/'.length) : ref;
  return remotes
    .filter((remote) => name.startsWith(`${remote}/`))
    .sort((a, b) => b.length - a.length)[0];
}

export function fetchBase(cwd: string, requested: string | undefined): string {
  const remotes = git(cwd, ['remote'])
    .split('\n')
    .filter((remote) => remote !== '');
  const remote = remoteOf(requested ?? 'origin/HEAD', remotes);
  if (remote === undefined) {
    throw new GitError(
      `--fetch needs a base on a remote, such as origin/dev. "${requested ?? 'origin/HEAD'}" names no remote of this repository.`
    );
  }
  try {
    git(cwd, ['fetch', '--quiet', remote]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new GitError(`Cannot fetch from "${remote}": ${reason}`);
  }
  return remote;
}

function verify(cwd: string, ref: string): string | undefined {
  try {
    return git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    return undefined;
  }
}

export function resolveBase(cwd: string, requested: string | undefined): Ref {
  if (requested !== undefined) {
    const sha = verify(cwd, requested);
    if (sha === undefined) {
      throw new GitError(
        `Cannot find the base ref "${requested}". Fetch it first, pass --fetch, or pass another --base <ref>.`
      );
    }
    return { ref: requested, sha };
  }
  const sha = verify(cwd, 'origin/HEAD');
  if (sha === undefined) {
    throw new GitError(
      'Cannot find the base ref "origin/HEAD". Pass --base <ref>, or run: git remote set-head origin --auto'
    );
  }
  try {
    return { ref: git(cwd, ['rev-parse', '--abbrev-ref', 'origin/HEAD']).trim(), sha };
  } catch {
    return { ref: 'origin/HEAD', sha };
  }
}

export function resolveHead(cwd: string): Ref {
  const sha = verify(cwd, 'HEAD');
  if (sha === undefined) {
    throw new GitError('HEAD has no commit yet.');
  }
  try {
    return { ref: git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim(), sha };
  } catch {
    return { ref: 'HEAD', sha };
  }
}

export function mergeBase(cwd: string, base: Ref, head: Ref): string {
  try {
    return git(cwd, ['merge-base', base.sha, head.sha]).trim();
  } catch {
    throw new GitError(
      `No common ancestor between "${base.ref}" and ${head.ref}. The two histories are unrelated.`
    );
  }
}

export function countCommits(cwd: string, base: Ref, head: Ref): Counts {
  return parseCounts(
    git(cwd, ['rev-list', '--left-right', '--count', `${base.sha}...${head.sha}`])
  );
}

export function commitDate(cwd: string, sha: string): Date {
  return new Date(git(cwd, ['show', '--no-patch', '--format=%cI', sha]).trim());
}

export function changedPaths(cwd: string, from: string, to: string): string[] {
  return parsePaths(
    git(cwd, ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', from, to])
  );
}

export function checkMerge(cwd: string, base: Ref, head: Ref): MergeCheck {
  const result = spawnSync(
    'git',
    ['merge-tree', '--write-tree', '--name-only', '-z', '--no-messages', base.sha, head.sha],
    { cwd, encoding: 'utf8', maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return parseMergeTree(result.status, result.stdout);
}
