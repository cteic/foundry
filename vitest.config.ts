import { createVitestConfig } from '@cteic/vitest-config';

export default createVitestConfig({
  include: ['packages/*/src/**/*.test.ts', 'fixtures/*/*.test.ts'],
});
