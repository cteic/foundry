import lint from '@commitlint/lint';
import load from '@commitlint/load';
import type { UserConfig } from '@commitlint/types';
import { describe, expect, it } from 'vitest';

import config, { createCommitlintConfig } from './index.js';

async function check(seed: UserConfig, message: string): Promise<string[]> {
  const loaded = await load(seed);
  const parserOpts = loaded.parserPreset?.parserOpts;
  const result = await lint(
    message,
    loaded.rules,
    typeof parserOpts === 'object' && parserOpts !== null ? { parserOpts } : {}
  );
  return result.errors.map((error) => error.name);
}

describe('@cteic/commitlint-config', () => {
  it('accepts a Conventional Commit with a scope', async () => {
    expect(await check(config, 'feat(web): add the landing page')).toEqual([]);
  });

  it('accepts a Conventional Commit without a scope', async () => {
    expect(await check(config, 'chore: bump dependencies')).toEqual([]);
  });

  it('rejects a message without a type', async () => {
    expect(await check(config, 'Added the landing page')).toEqual(
      expect.arrayContaining(['type-empty', 'subject-empty'])
    );
  });

  it('rejects a scope outside the allowed list', async () => {
    const scoped = createCommitlintConfig({ scopes: ['web', 'worker'] });

    expect(await check(scoped, 'feat(web): add the landing page')).toEqual([]);
    expect(await check(scoped, 'feat(mobile): add the landing page')).toEqual(['scope-enum']);
  });
});
