import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import type { Config } from 'eslint/config';
import { describe, expect, it } from 'vitest';

import { boundary, createConfig } from './index.js';

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));

function createEslint(extra: Config[] = []): ESLint {
  return new ESLint({
    cwd: fixturesDir,
    overrideConfigFile: true,
    overrideConfig: [...createConfig({ tsconfigRootDir: fixturesDir }), ...extra],
  });
}

async function lintFixture(file: string, extra: Config[] = []): Promise<Linter.LintMessage[]> {
  const [result] = await createEslint(extra).lintFiles([file]);
  if (result === undefined) {
    throw new Error(`No lint result for ${file}`);
  }
  return result.messages;
}

function severityOf(entry: Linter.RuleEntry | undefined): Linter.RuleSeverity | undefined {
  if (Array.isArray(entry)) {
    return entry[0];
  }
  return entry;
}

function isWarn(severity: unknown): boolean {
  return severity === 'warn' || severity === 1;
}

describe('@cteic/eslint-config bans', () => {
  it.each([
    ['enum.ts', 'no-restricted-syntax'],
    ['type-assertion.ts', '@typescript-eslint/consistent-type-assertions'],
    ['non-null-assertion.ts', '@typescript-eslint/no-non-null-assertion'],
    ['explicit-any.ts', '@typescript-eslint/no-explicit-any'],
  ])('%s reports only %s, as an error', async (file, rule) => {
    const messages = await lintFixture(file);

    expect(messages.map((message) => [message.ruleId, message.severity])).toEqual([[rule, 2]]);
  });

  it.each(['clean.ts', 'clean.js'])('%s passes with no messages', async (file) => {
    expect(await lintFixture(file)).toEqual([]);
  });
});

describe('boundary', () => {
  it('reports restricted imports and globals as errors', async () => {
    const messages = await lintFixture('boundary.ts', [
      boundary({
        files: ['boundary.ts'],
        imports: ['node:*'],
        globals: ['window'],
        message: 'Core code must stay platform independent.',
      }),
    ]);

    expect(messages.map((message) => [message.ruleId, message.severity])).toEqual([
      ['no-restricted-imports', 2],
      ['no-restricted-globals', 2],
    ]);
  });

  it('passes the same file without the boundary', async () => {
    expect(await lintFixture('boundary.ts')).toEqual([]);
  });
});

describe('severity', () => {
  it('sets no rule or linter option to warn in the exported config', () => {
    const offenders: string[] = [];
    for (const config of createConfig()) {
      for (const [name, entry] of Object.entries(config.rules ?? {})) {
        if (isWarn(severityOf(entry))) {
          offenders.push(name);
        }
      }
      const linterOptions = config.linterOptions ?? {};
      for (const [name, value] of Object.entries(linterOptions)) {
        if (isWarn(value)) {
          offenders.push(`linterOptions.${name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it.each(['clean.ts', 'clean.js'])('resolves no rule to warn for %s', async (file) => {
    const resolved: unknown = await createEslint().calculateConfigForFile(file);
    if (typeof resolved !== 'object' || resolved === null || !('rules' in resolved)) {
      throw new Error(`No resolved config for ${file}`);
    }
    const { rules } = resolved;
    if (typeof rules !== 'object' || rules === null) {
      throw new Error(`No resolved rules for ${file}`);
    }
    const offenders = Object.entries(rules)
      .filter(([, entry]) => isWarn(Array.isArray(entry) ? entry[0] : entry))
      .map(([name]) => name);

    expect(Object.keys(rules).length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

describe('rule sets', () => {
  it.each([
    ['@typescript-eslint/no-unnecessary-condition', 'strictTypeChecked'],
    ['@typescript-eslint/consistent-type-definitions', 'stylisticTypeChecked'],
  ])('enables %s from %s as an error for TypeScript files', async (rule) => {
    const resolved: unknown = await createEslint().calculateConfigForFile('clean.ts');
    if (typeof resolved !== 'object' || resolved === null || !('rules' in resolved)) {
      throw new Error('No resolved config for clean.ts');
    }
    const { rules } = resolved;
    if (typeof rules !== 'object' || rules === null || !(rule in rules)) {
      throw new Error(`Rule ${rule} is not enabled`);
    }
    const entry: unknown = Object.entries(rules).find(([name]) => name === rule)?.[1];

    expect(Array.isArray(entry) ? entry[0] : entry).toBe(2);
  });
});
