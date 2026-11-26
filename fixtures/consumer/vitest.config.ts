import { createVitestConfig } from '@cteic/vitest-config';

export default createVitestConfig({
  coverageFloor: { statements: 50, branches: 80, functions: 65, lines: 50 },
});
