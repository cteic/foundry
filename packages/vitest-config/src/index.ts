import { coverageConfigDefaults, defineConfig, type ViteUserConfig } from 'vitest/config';

export interface CoverageFloor {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface CreateVitestConfigOptions {
  include?: string[];
  environment?: 'node' | 'jsdom' | 'happy-dom';
  coverageInclude?: string[];
  coverageFloor?: CoverageFloor;
}

export const defaultInclude = ['**/*.{test,spec}.{ts,tsx}'];

export const coverageExclude = [
  ...coverageConfigDefaults.exclude,
  '**/*.{test,spec}.{ts,tsx}',
  '**/*.config.{ts,js,mjs,cjs}',
  '**/*.d.ts',
  '**/fixtures/**',
];

export function createVitestConfig(options: CreateVitestConfigOptions = {}): ViteUserConfig {
  return defineConfig({
    test: {
      include: options.include ?? defaultInclude,
      environment: options.environment ?? 'node',
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        reportsDirectory: './coverage',
        exclude: coverageExclude,
        ...(options.coverageInclude === undefined ? {} : { include: options.coverageInclude }),
        ...(options.coverageFloor === undefined
          ? {}
          : { thresholds: { ...options.coverageFloor } }),
      },
    },
  });
}
