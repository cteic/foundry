import { fileURLToPath } from 'node:url';
import type { Config } from 'prettier';

const config: Config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
  printWidth: 100,
  tabWidth: 2,
  plugins: [fileURLToPath(import.meta.resolve('@ianvs/prettier-plugin-sort-imports'))],
  importOrder: ['<BUILTIN_MODULES>', '<THIRD_PARTY_MODULES>', '', '^@cteic/(.*)$', '', '^[.]'],
};

export default config;
