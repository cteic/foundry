import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

import config from './index.js';

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
