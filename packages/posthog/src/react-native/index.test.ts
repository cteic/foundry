import { describe, expect, it } from 'vitest';

import { posthogHosts } from '../core/hosts.js';
import { nativeOptions } from './index.js';

describe('nativeOptions', () => {
  it('keeps replay off and captures crashes', () => {
    expect(nativeOptions({ host: posthogHosts.us })).toMatchObject({
      host: 'https://us.i.posthog.com',
      enableSessionReplay: false,
      personProfiles: 'identified_only',
      errorTracking: {
        autocapture: { uncaughtExceptions: true, unhandledRejections: true, console: false },
      },
    });
  });

  it('lets the app override a default', () => {
    expect(nativeOptions({ host: posthogHosts.us, disabled: true })).toMatchObject({
      disabled: true,
    });
  });
});
