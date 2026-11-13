import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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
