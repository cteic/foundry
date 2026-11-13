import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

export interface ScreenshotDefaults {
  animations: 'disabled';
  caret: 'hide';
  scale: 'css';
  maxDiffPixelRatio: number;
}

export const screenshotDefaults: ScreenshotDefaults = {
  animations: 'disabled',
  caret: 'hide',
  scale: 'css',
  maxDiffPixelRatio: 0.01,
};

function isCi(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI;
  return value !== undefined && value !== '' && value !== 'false';
}

export function createPlaywrightConfig(
  overrides: PlaywrightTestConfig = {},
  env: NodeJS.ProcessEnv = process.env
): PlaywrightTestConfig {
  const ci = isCi(env);
  return defineConfig(
    {
      fullyParallel: true,
      forbidOnly: ci,
      retries: ci ? 2 : 0,
      reporter: ci ? 'blob' : 'list',
      use: {
        trace: 'on-first-retry',
      },
      expect: {
        toHaveScreenshot: { ...screenshotDefaults },
      },
      projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    },
    overrides
  );
}
