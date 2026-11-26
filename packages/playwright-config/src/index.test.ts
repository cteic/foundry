import { describe, expect, it } from 'vitest';

import { createPlaywrightConfig, screenshotDefaults } from './index.js';

describe('createPlaywrightConfig', () => {
  it('sets screenshot defaults for visual regression', () => {
    const config = createPlaywrightConfig({}, {});

    expect(config.expect?.toHaveScreenshot).toEqual({
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.01,
    });
  });

  it('keeps screenshot defaults when a consumer overrides use and expect', () => {
    const config = createPlaywrightConfig(
      {
        testDir: './e2e',
        use: { baseURL: 'http://localhost:3000' },
        expect: { timeout: 10_000 },
      },
      {}
    );

    expect(config.testDir).toBe('./e2e');
    expect(config.use).toMatchObject({ baseURL: 'http://localhost:3000', trace: 'on-first-retry' });
    expect(config.expect).toMatchObject({ timeout: 10_000, toHaveScreenshot: screenshotDefaults });
  });

  it('retries, forbids .only and writes blob reports on CI', () => {
    const config = createPlaywrightConfig({}, { CI: 'true' });

    expect(config).toMatchObject({ retries: 2, forbidOnly: true, reporter: 'blob' });
  });

  it('does not retry locally', () => {
    const config = createPlaywrightConfig({}, {});

    expect(config).toMatchObject({ retries: 0, forbidOnly: false, reporter: 'list' });
  });
});
