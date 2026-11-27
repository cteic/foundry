import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { exitCode, run } from './run.ts';

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

const workspace = `minimumReleaseAge: 4320
minimumReleaseAgeExclude:
  - '@cteic/*'
minimumReleaseAgeStrict: true
strictDepBuilds: true
blockExoticSubdeps: true
trustPolicy: no-downgrade
`;

let repo = '';

function invoke(...argv: string[]): Result {
  let stdout = '';
  let stderr = '';
  const code = run(argv, {
    cwd: repo,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

function write(name: string, text: string): void {
  writeFileSync(join(repo, name), text);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'install-policy-'));
  write('package.json', JSON.stringify({ packageManager: 'pnpm@11.5.2' }));
  write('pnpm-workspace.yaml', workspace);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('run', () => {
  it('exits 0 on a repo that matches the baseline', () => {
    const result = invoke();
    expect(result.code).toBe(exitCode.pass);
    expect(result.stdout).toContain('pass');
  });

  it('exits 1 and names each drifted setting', () => {
    write('pnpm-workspace.yaml', workspace.replace('no-downgrade', 'off'));
    write('package.json', JSON.stringify({ packageManager: 'pnpm@10.0.0' }));
    const result = invoke();
    expect(result.code).toBe(exitCode.drift);
    expect(result.stdout).toContain('2 setting(s) drift');
    expect(result.stdout).toContain('trustPolicy: must be "no-downgrade"');
    expect(result.stdout).toContain('packageManager: must pin pnpm 11');
  });

  it('prints JSON with --json', () => {
    write('pnpm-workspace.yaml', workspace.replace('strictDepBuilds: true', ''));
    const result = invoke('--json');
    const report: unknown = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      pass: false,
      findings: [{ setting: 'strictDepBuilds' }],
    });
  });

  it('exits 2 when pnpm-workspace.yaml is missing', () => {
    rmSync(join(repo, 'pnpm-workspace.yaml'));
    const result = invoke();
    expect(result.code).toBe(exitCode.error);
    expect(result.stderr).toContain('pnpm-workspace.yaml not found');
  });

  it('exits 2 on an unknown flag', () => {
    const result = invoke('--fix');
    expect(result.code).toBe(exitCode.error);
    expect(result.stderr).toContain('Run install-policy --help');
  });

  it('reads another directory with --root', () => {
    const ignore = (text: string): void => {
      expect(typeof text).toBe('string');
    };
    const code = run(['--root', repo], { cwd: tmpdir(), stdout: ignore, stderr: ignore });
    expect(code).toBe(exitCode.pass);
  });
});
