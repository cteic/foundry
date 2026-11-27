import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { createConfig } from './index.js';
import { react, reactRules } from './react.js';

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));

async function lintFixture(file: string): Promise<Linter.LintMessage[]> {
  const eslint = new ESLint({
    cwd: fixturesDir,
    overrideConfigFile: true,
    overrideConfig: [...createConfig({ tsconfigRootDir: fixturesDir }), react()],
  });
  const [result] = await eslint.lintFiles([file]);
  if (result === undefined) {
    throw new Error(`No lint result for ${file}`);
  }
  return result.messages;
}

describe('@cteic/eslint-config/react bans', () => {
  it.each([
    ['react/rules-of-hooks.tsx', 'react-hooks/rules-of-hooks'],
    ['react/exhaustive-deps.tsx', 'react-hooks/exhaustive-deps'],
    ['react/set-state-in-render.tsx', 'react-hooks/set-state-in-render'],
    ['react/set-state-in-effect.tsx', 'react-hooks/set-state-in-effect'],
    ['react/refs.tsx', 'react-hooks/refs'],
    ['react/purity.tsx', 'react-hooks/purity'],
    ['react/immutability.tsx', 'react-hooks/immutability'],
    ['react/globals.tsx', 'react-hooks/globals'],
    ['react/static-components.tsx', 'react-hooks/static-components'],
    ['react/use-memo.tsx', 'react-hooks/use-memo'],
    ['react/void-use-memo.tsx', 'react-hooks/void-use-memo'],
    ['react/error-boundaries.tsx', 'react-hooks/error-boundaries'],
  ])('%s reports only %s, as an error', async (file, rule) => {
    const messages = await lintFixture(file);

    expect(messages.map((message) => [message.ruleId, message.severity])).toEqual([[rule, 2]]);
  });

  it('passes a clean component with no messages', async () => {
    expect(await lintFixture('react/clean.tsx')).toEqual([]);
  });
});

describe('react severity', () => {
  it.each([
    'react-hooks/exhaustive-deps',
    'react-hooks/incompatible-library',
    'react-hooks/preserve-manual-memoization',
    'react-hooks/unsupported-syntax',
  ])('sets %s to error', (rule) => {
    const entry = reactRules[rule];

    expect(Array.isArray(entry) ? entry[0] : entry).toBe('error');
  });

  it('sets every React rule to error', () => {
    const offenders = Object.entries(reactRules)
      .filter(([, entry]) => (Array.isArray(entry) ? entry[0] : entry) !== 'error')
      .map(([name]) => name);

    expect(Object.keys(reactRules).length).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });

  it('applies to the files it is given', () => {
    expect(react({ files: ['app/**/*.tsx'] }).files).toEqual(['app/**/*.tsx']);
  });
});
