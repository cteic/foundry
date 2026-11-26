import { createConfig } from '@cteic/eslint-config';

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ['packages/eslint-config/src/fixtures/**'],
});
