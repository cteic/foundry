import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, getFileInfo } from 'prettier';
import { describe, expect, it } from 'vitest';

import config from './index.js';

const ignorePath = fileURLToPath(import.meta.resolve('@cteic/prettier-config/prettierignore'));

function stringArrayField(value: unknown, key: string): string[] {
  if (typeof value !== 'object' || value === null) {
    throw new Error('package.json did not parse to an object');
  }
  const record: Record<string, unknown> = { ...value };
  const field = record[key];
  if (!Array.isArray(field)) {
    throw new Error(`package.json "${key}" is not an array`);
  }
  return field.filter((entry): entry is string => typeof entry === 'string');
}

describe('@cteic/prettier-config', () => {
  it('formats with single quotes and sorted, grouped imports', async () => {
    const input = [
      'import { helper } from "./helper";',
      'import { base } from "@cteic/eslint-config";',
      'import { readFile } from "node:fs/promises";',
      'import { describe } from "vitest";',
      'export const all = [helper, base, readFile, describe];',
      '',
    ].join('\n');

    const output = await format(input, { ...config, filepath: 'example.ts' });

    expect(output).toBe(
      [
        "import { readFile } from 'node:fs/promises';",
        "import { describe } from 'vitest';",
        '',
        "import { base } from '@cteic/eslint-config';",
        '',
        "import { helper } from './helper';",
        '',
        'export const all = [helper, base, readFile, describe];',
        '',
      ].join('\n')
    );
  });
});

describe('@cteic/prettier-config/prettierignore', () => {
  it('resolves through the subpath export', async () => {
    const contents = await readFile(ignorePath, 'utf8');

    expect(ignorePath).toMatch(/prettierignore$/);
    expect(contents).toContain('pnpm-lock.yaml');
  });

  it('is published, so a consumer can reach it in node_modules', async () => {
    const manifestPath = fileURLToPath(import.meta.resolve('@cteic/prettier-config/package.json'));
    const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));

    expect(stringArrayField(manifest, 'files')).toContain('prettierignore');
  });

  it.each([
    ['pnpm-lock.yaml'],
    ['package-lock.json'],
    ['npm-shrinkwrap.json'],
    ['yarn.lock'],
    ['bun.lock'],
    ['bun.lockb'],
    ['deno.lock'],
    ['Cargo.lock'],
    ['composer.lock'],
    ['flake.lock'],
    ['apps/web/pnpm-lock.yaml'],
    ['packages/ui/package-lock.json'],
  ])('ignores the generator-owned %s', async (file) => {
    const info = await getFileInfo(file, { ignorePath });

    expect(info.ignored).toBe(true);
  });

  it.each([['src/index.ts'], ['README.md'], ['package.json'], ['prettier.config.js']])(
    'leaves %s to the formatter',
    async (file) => {
      const info = await getFileInfo(file, { ignorePath });

      expect(info.ignored).toBe(false);
    }
  );

  it('composes with a repo-local .prettierignore', async () => {
    const both = [ignorePath, fileURLToPath(import.meta.resolve('../../../.prettierignore'))];

    expect((await getFileInfo('pnpm-lock.yaml', { ignorePath: both })).ignored).toBe(true);
    expect((await getFileInfo('LICENSE', { ignorePath: both })).ignored).toBe(true);
    expect((await getFileInfo('README.md', { ignorePath: both })).ignored).toBe(false);
  });
});
