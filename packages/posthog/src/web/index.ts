import type { PostHogConfig } from 'posthog-js';

import { sanitizePath, type SanitizePathOptions } from '../core/sanitize-path.js';
import type { CaptureClient } from '../core/track.js';

export interface WebOptionsInput extends Partial<PostHogConfig> {
  /** Ingest host: `posthogHosts.us`, `posthogHosts.eu` or a same-origin reverse proxy path. */
  api_host: string;
}

/**
 * Options for `posthog.init` with the cteic privacy defaults.
 * Autocapture and pageview capture are off, so nothing is sent that the app did not name.
 * Session replay is off, and masks every input and text node if a project turns it on.
 * Uncaught exceptions are captured. Pass any option to override it.
 *
 * ```ts
 * posthog.init(key, webOptions({ api_host: posthogHosts.eu }));
 * ```
 */
export function webOptions(input: WebOptionsInput): Partial<PostHogConfig> {
  return {
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    capture_exceptions: true,
    disable_session_recording: true,
    respect_dnt: true,
    person_profiles: 'identified_only',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
    },
    ...input,
  };
}

/**
 * Capture a pageview with the path masked by `sanitizePath`.
 * Call it on every route change, because `webOptions` turns automatic pageviews off.
 */
export function capturePageview(
  client: CaptureClient,
  origin: string,
  pathname: string,
  options: SanitizePathOptions = {}
): void {
  client.capture('$pageview', { $current_url: origin + sanitizePath(pathname, options) });
}
