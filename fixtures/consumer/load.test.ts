import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import lint from '@commitlint/lint';
import load from '@commitlint/load';
import { ESLint } from 'eslint';
import { check, resolveConfig } from 'prettier';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const fixtureDir = fileURLToPath(new URL('.', import.meta.url));
const samplePath = join(fixtureDir, 'src/sample.ts');
const run = promisify(execFile);
const prettierCli = fileURLToPath(import.meta.resolve('prettier/bin/prettier.cjs'));
const sharedIgnore = 'node_modules/@cteic/prettier-config/prettierignore';

async function prettierCheck(cwd: string): Promise<{ code: number; output: string }> {
  const args = [
    prettierCli,
    '--check',
    '.',
    '--ignore-path',
    sharedIgnore,
    '--ignore-path',
    '.prettierignore',
  ];
  try {
    const { stdout, stderr } = await run(process.execPath, args, { cwd });
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    if (error instanceof Error && 'code' in error && 'stdout' in error && 'stderr' in error) {
      const { code, stdout, stderr } = error;
      return {
        code: typeof code === 'number' ? code : 1,
        output:
          (typeof stdout === 'string' ? stdout : '') + (typeof stderr === 'string' ? stderr : ''),
      };
    }
    throw error;
  }
}

describe('minimal consumer', () => {
  it('@cteic/tsconfig: compiles with the strict base', () => {
    const configPath = join(fixtureDir, 'tsconfig.json');
    const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
    const raw: unknown = read.config;
    expect(read.error).toBeUndefined();
    const parsed = ts.parseJsonConfigFileContent(raw, ts.sys, fixtureDir);
    const program = ts.createProgram(parsed.fileNames, parsed.options);

    expect(parsed.errors).toEqual([]);
    expect(parsed.options).toMatchObject({
      strict: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      verbatimModuleSyntax: true,
    });
    expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.messageText)).toEqual(
      []
    );
  });

  it('@cteic/eslint-config: passes clean code and fails an enum', async () => {
    const eslint = new ESLint({ cwd: fixtureDir });
    const [clean] = await eslint.lintFiles([samplePath]);
    const [dirty] = await eslint.lintText('export enum Status {\n  Open,\n}\n', {
      filePath: samplePath,
    });

    expect(clean?.messages).toEqual([]);
    expect(dirty?.messages.map((message) => message.ruleId)).toEqual(['no-restricted-syntax']);
  });

  it('@cteic/prettier-config: resolves and accepts formatted code', async () => {
    const options = await resolveConfig(samplePath);
    const source = await readFile(samplePath, 'utf8');

    expect(options).toMatchObject({ singleQuote: true, printWidth: 100 });
    expect(await check(source, { ...options, filepath: samplePath })).toBe(true);
  });

  it('@cteic/prettier-config: ships prettierignore at the documented node_modules path', async () => {
    const contents = await readFile(join(fixtureDir, sharedIgnore), 'utf8');

    expect(contents).toContain('pnpm-lock.yaml');
    expect(contents).toContain('package-lock.json');
    expect(contents).toContain('yarn.lock');
  });

  it('@cteic/prettier-config: --ignore-path keeps the formatter off lockfiles', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'cteic-lockfile-ignore-'));
    await mkdir(join(repo, 'node_modules/@cteic/prettier-config'), { recursive: true });
    await writeFile(
      join(repo, sharedIgnore),
      await readFile(join(fixtureDir, sharedIgnore), 'utf8')
    );
    // pnpm's native inline form. Prettier would expand it and flip the quotes.
    await writeFile(
      join(repo, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n\npackages:\n\n  left-pad@1.3.0:\n    resolution: {integrity: sha512-XI5MPzVNApjAyhQzphX8BkmKsKUxD4LdyK24iZeQGinBN9yTQT3bFlCBy/aVx2HrNcqQGsdot8ghrjyrvMCoEg==}\n"
    );
    await writeFile(join(repo, 'yarn.lock'), '{"a":    1}\n');
    await writeFile(join(repo, 'generated.json'), '{"b":    2}\n');
    await writeFile(join(repo, '.prettierignore'), 'generated.json\n');
    await writeFile(join(repo, 'clean.ts'), 'const a = 1;\n');

    const ignored = await prettierCheck(repo);

    expect(ignored.output).not.toContain('pnpm-lock.yaml');
    expect(ignored.code).toBe(0);

    // The same invocation must still fail on a file nobody ignored.
    await writeFile(join(repo, 'messy.ts'), 'const b   =    2\n');
    const caught = await prettierCheck(repo);

    expect(caught.code).not.toBe(0);
    expect(caught.output).toContain('messy.ts');
    expect(caught.output).not.toContain('pnpm-lock.yaml');
  });

  it('@cteic/vitest-config: loads with the coverage floor', async () => {
    const { default: config } = await import('./vitest.config.js');

    expect(config.test?.coverage).toMatchObject({
      provider: 'v8',
      thresholds: { statements: 50, branches: 80, functions: 65, lines: 50 },
    });
  });

  it('@cteic/playwright-config: lists the consumer suite', async () => {
    const cli = fileURLToPath(import.meta.resolve('@playwright/test/cli'));
    const { stdout } = await run(process.execPath, [cli, 'test', '--list'], {
      cwd: fixtureDir,
      env: { ...process.env, CI: '' },
    });

    expect(stdout).toContain('consumer smoke');
  });

  it('@cteic/charts: core draws paths without React, react exports components', async () => {
    const core = await import('@cteic/charts/core');
    const react = await import('@cteic/charts/react');
    const identity = (value: number) => value;
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ];

    expect(core.generateLinePath(points, identity, identity)).toBe('M0,0L10,20');
    expect(typeof react.PriceChart).toBe('function');
    expect(typeof react.Sparkline).toBe('function');
  });

  it('@cteic/commitlint-config: enforces the consumer scopes', async () => {
    const loaded = await load({}, { cwd: fixtureDir });
    const parserOpts = loaded.parserPreset?.parserOpts;
    const options = typeof parserOpts === 'object' && parserOpts !== null ? { parserOpts } : {};
    const good = await lint('feat(web): add the landing page', loaded.rules, options);
    const bad = await lint('feat(api): add the landing page', loaded.rules, options);

    expect(good.valid).toBe(true);
    expect(bad.errors.map((error) => error.name)).toEqual(['scope-enum']);
  });
});
