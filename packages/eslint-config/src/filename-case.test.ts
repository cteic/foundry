import { describe, expect, it } from 'vitest';

import { isKebabFileName } from './filename-case.js';

describe('isKebabFileName', () => {
  it.each([
    'session-logger.tsx',
    'index.ts',
    'vitest.config.ts',
    'live-rank.spec.ts',
    'next-env.d.ts',
    'v2-client.ts',
    '[id].tsx',
    '[...slug].tsx',
    '[[...slug]].tsx',
    '[eventId].tsx',
    '(tabs).tsx',
    '_layout.tsx',
    '+not-found.tsx',
    '/repo/apps/web/src/lib/diary.ts',
  ])('accepts %s', (name) => {
    expect(isKebabFileName(name)).toBe(true);
  });

  it.each([
    'ActivityController.ts',
    'sessionLogger.tsx',
    'session_logger.ts',
    'session--logger.ts',
    '-leading.ts',
    'trailing-.ts',
  ])('rejects %s', (name) => {
    expect(isKebabFileName(name)).toBe(false);
  });
});
