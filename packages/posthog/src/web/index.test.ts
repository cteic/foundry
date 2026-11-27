import { describe, expect, it } from 'vitest';

import { posthogHosts } from '../core/hosts.js';
import type { CaptureClient, EventValue } from '../core/track.js';
import { capturePageview, webOptions } from './index.js';

describe('webOptions', () => {
  it('turns off everything the app did not name', () => {
    const options = webOptions({ api_host: posthogHosts.eu });

    expect(options).toMatchObject({
      api_host: 'https://eu.i.posthog.com',
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      respect_dnt: true,
      person_profiles: 'identified_only',
      session_recording: { maskAllInputs: true, maskTextSelector: '*' },
    });
  });

  it('lets the app override a default', () => {
    expect(webOptions({ api_host: '/ingest', capture_exceptions: false })).toMatchObject({
      api_host: '/ingest',
      capture_exceptions: false,
    });
  });
});

describe('capturePageview', () => {
  it('sends the masked path with no query string', () => {
    const calls: [string, Record<string, EventValue> | undefined][] = [];
    const client: CaptureClient = {
      capture(event, properties) {
        calls.push([event, properties]);
      },
    };

    capturePageview(client, 'https://app.example.com', '/rivals/12345?tab=h2h');

    expect(calls).toEqual([['$pageview', { $current_url: 'https://app.example.com/rivals/:id' }]]);
  });
});
