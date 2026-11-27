import type { PostHog as WebClient } from 'posthog-js';
import type { PostHog as NativeClient } from 'posthog-react-native';
import { describe, expectTypeOf, it } from 'vitest';

import type { CaptureClient } from './track.js';

describe('CaptureClient', () => {
  it('accepts the real web and React Native clients', () => {
    expectTypeOf<WebClient>().toExtend<CaptureClient>();
    expectTypeOf<NativeClient>().toExtend<CaptureClient>();
  });
});
