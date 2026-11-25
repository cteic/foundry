import { execFileSync } from 'node:child_process';

export class GitError extends Error {}

export interface Base {
  ref: string;
  sha: string;
}

function stderrOf(error: unknown): string {
  if (error instanceof Error && 'stderr' in error && typeof error.stderr === 'string') {
    return error.stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

export function git(cwd: string, args: readonly string[], input?: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(input === undefined ? {} : { input }),
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

export function diffNumstat(cwd: string, sha: string): string {
  return git(cwd, ['diff', '--numstat', '-z', '-M', '--no-ext-diff', sha, 'HEAD']);
}

export function linguistGenerated(cwd: string, paths: readonly string[]): Set<string> {
  const generated = new Set<string>();
  if (paths.length === 0) {
    return generated;
  }
  const output = git(
    cwd,
    ['check-attr', '-z', '--stdin', 'linguist-generated'],
    `${paths.join('\0')}\0`
  );
  const fields = output.split('\0');
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const value = fields[index + 2];
    if (value === 'set' || value === 'true') {
      generated.add(fields[index] ?? '');
    }
  }
  return generated;
}
