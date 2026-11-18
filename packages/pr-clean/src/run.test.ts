import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emDash } from './patterns.ts';
import { ownFiles, run } from './run.ts';

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

interface JsonReport {
  verdict: string;
  commits: number;
  rules: { rule: string; status: string; findings: { check: string; excerpt: string }[] }[];
}

const owner = 'Ada Example <ada@example.com>';
const ada = { name: 'Ada Example', email: 'ada@example.com' };
const tool = { name: 'Some Tool', email: 'tool@example.com' };

let repo = '';

function git(identity: { name: string; email: string }, ...args: string[]): void {
  execFileSync('git', args, {
    cwd: repo,
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: identity.name,
      GIT_AUTHOR_EMAIL: identity.email,
      GIT_COMMITTER_NAME: identity.name,
      GIT_COMMITTER_EMAIL: identity.email,
    },
  });
}

function write(path: string, content: string): void {
  const file = join(repo, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function commitAll(message: string, identity = ada): void {
  git(identity, 'add', '--all');
  git(identity, 'commit', '--quiet', '--message', message);
}

function prClean(...argv: string[]): Result {
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
  return typeof value === 'object' && value !== null && 'verdict' in value && 'rules' in value;
}

function jsonReport(result: Result): JsonReport {
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isJsonReport(parsed)) {
    throw new Error(`Not a report: ${result.stdout}`);
  }
  return parsed;
}

function statuses(report: JsonReport): Record<string, string> {
  return Object.fromEntries(report.rules.map((result) => [result.rule, result.status]));
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'pr-clean-'));
  git(ada, 'init', '--quiet', '--initial-branch', 'main');
  write('README.md', `# Project\n\nOld text ${emDash} with an em dash that predates the branch.\n`);
  commitAll('chore: initial commit');
  git(ada, 'switch', '--quiet', '--create', 'feat/change');
  write('src/a.ts', 'export const a = 1;\n');
  commitAll('feat: add a');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('pr-clean in a real repository', () => {
  it('passes a clean branch and ignores what was on the base already', () => {
    const result = prClean('--base', 'main', '--allow-author', owner, '--json');
    const report = jsonReport(result);

    expect(result.code).toBe(0);
    expect(report).toMatchObject({ verdict: 'pass', commits: 1 });
    expect(statuses(report)).toEqual({
      author: 'pass',
      trailers: 'pass',
      attribution: 'pass',
      'em-dash': 'pass',
    });
  });

  it('fails every rule on a branch with each mistake, and exits 1', () => {
    write('docs/notes.md', `A sentence ${emDash} with a dash.\n\nBuilt with Cursor\n`);
    write('src/b.ts', `// a comment ${emDash} in code\nexport const b = 2;\n`);
    commitAll('feat: add b\n\nCo-authored-by: Some Tool <tool@example.com>', tool);

    const result = prClean('--base', 'main', '--allow-author', owner, '--json');
    const report = jsonReport(result);
    const checks = report.rules.map((rule) => rule.findings.map((finding) => finding.check));

    expect(result.code).toBe(1);
    expect(report).toMatchObject({ verdict: 'fail', commits: 2 });
    expect(checks).toEqual([
      ['author', 'committer'],
      ['co-authored-by'],
      ['built-with-tool'],
      ['em-dash'],
    ]);
  });

  it('prints the offending hash, the file and line, and how to fix each rule', () => {
    write('docs/notes.md', 'Fine line.\nGenerated with [Some Tool](https://example.com)\n');
    commitAll('feat: add notes', tool);

    const result = prClean('--base', 'main', '--allow-author', owner);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('pr-clean: FAIL');
    expect(result.stdout).toMatch(/[0-9a-f]{7} {2}author: The author is not on the allowed list/);
    expect(result.stdout).toContain('Some Tool <tool@example.com>');
    expect(result.stdout).toContain('docs/notes.md:2  generated-link');
    expect(result.stdout).toContain('--reset-author');
  });

  it('exits 0 with --dry-run and still reports the findings', () => {
    write('docs/notes.md', 'Notes.\n');
    commitAll('docs: add notes\n\nGenerated with a coding tool');

    const result = prClean('--base', 'main', '--allow-author', owner, '--dry-run');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('pr-clean: FAIL  (dry run: exit code stays 0)');
    expect(result.stdout).toContain('generated-line');
  });

  it('turns a rule off with --skip', () => {
    write('docs/notes.md', `A sentence ${emDash} with a dash.\n`);
    commitAll('docs: add notes', tool);

    const result = prClean('--base', 'main', '--skip', 'author', '--skip', 'em-dash', '--json');

    expect(result.code).toBe(0);
    expect(statuses(jsonReport(result))).toMatchObject({ author: 'skipped', 'em-dash': 'skipped' });
  });

  it('checks the PR body file', () => {
    write('body.md', '## Summary\n\nhttps://claude.ai/code/session_01\n');

    const result = prClean('--base', 'main', '--skip', 'author', '--pr-body-file', 'body.md');

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('PR body:3  session-link');
  });

  it('honours the allow comment and --ignore', () => {
    write('docs/stack.md', 'Built with Cursor <!-- pr-clean-allow -->\n');
    write('CHANGELOG.md', 'Built with Cursor\n');
    commitAll('docs: describe the stack');

    expect(prClean('--base', 'main', '--allow-author', owner).code).toBe(1);
    expect(
      prClean('--base', 'main', '--allow-author', owner, '--ignore', 'CHANGELOG.md').code
    ).toBe(0);
  });

  it('reads the allowed authors from .pr-clean.json and from package.json', () => {
    write('.pr-clean.json', JSON.stringify({ base: 'main', allowAuthors: [owner] }));
    expect(prClean().code).toBe(0);

    rmSync(join(repo, '.pr-clean.json'));
    write(
      'package.json',
      JSON.stringify({ 'pr-clean': { base: 'main', allowAuthors: [tool.name] } })
    );
    expect(prClean().code).toBe(2);

    write(
      'package.json',
      JSON.stringify({
        'pr-clean': { base: 'main', allowAuthors: ['Some Tool <tool@example.com>'] },
      })
    );
    expect(prClean().code).toBe(1);
  });

  it('exits 2 with no allowed author, an unknown rule, a missing base or a missing body file', () => {
    expect(prClean('--base', 'main').stderr).toContain('The author rule needs an allowed list');
    expect(prClean('--base', 'main').code).toBe(2);
    expect(prClean('--base', 'main', '--skip', 'nope').code).toBe(2);
    expect(prClean('--skip', 'author').stderr).toContain('Cannot find the base ref "origin/HEAD"');
    expect(prClean('--base', 'main', '--skip', 'author', '--pr-body-file', 'none.md').code).toBe(2);
    expect(prClean('--unknown').code).toBe(2);
  });

  it('prints help and exits 0', () => {
    const result = prClean('--help');

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: pr-clean [options]');
  });
});

describe('ownFiles', () => {
  it('skips its own rule file and tests when the tool lives in the repo it checks', () => {
    expect(ownFiles('/work/repo', '/work/repo/packages/pr-clean')).toEqual([
      'packages/pr-clean/src/patterns.ts',
      'packages/pr-clean/src/**/*.test.ts',
    ]);
  });

  it('skips nothing when the tool is installed outside the repo', () => {
    expect(ownFiles('/work/repo', '/work/other/node_modules/@cteic/pr-clean')).toEqual([]);
  });
});
