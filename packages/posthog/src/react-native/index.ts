import type { PostHogOptions } from 'posthog-react-native';

export interface NativeOptionsInput extends PostHogOptions {
  /** Ingest host: `posthogHosts.us` or `posthogHosts.eu`. */
  host: string;
}

/**
 * Options for `<PostHogProvider options={...}>` with the cteic privacy defaults.
 * Session replay is off, profiles stay anonymous until the app identifies someone,
 * and uncaught exceptions and unhandled rejections are captured. Pass any option to override it.
 * Touch autocapture is a separate provider prop: set `autocapture={false}`.
 *
 * ```tsx
 * <PostHogProvider apiKey={key} autocapture={false} options={nativeOptions({ host: posthogHosts.us })}>
 * ```
 */
export function nativeOptions(input: NativeOptionsInput): PostHogOptions {
  return {
    captureAppLifecycleEvents: true,
    enableSessionReplay: false,
    personProfiles: 'identified_only',
    errorTracking: {
      autocapture: { uncaughtExceptions: true, unhandledRejections: true, console: false },
    },
    ...input,
  };
}
