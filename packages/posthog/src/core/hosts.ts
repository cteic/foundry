/** PostHog Cloud ingest hosts. Each app picks its region explicitly, so no data lands in the wrong one. */
export const posthogHosts = {
  us: 'https://us.i.posthog.com',
  eu: 'https://eu.i.posthog.com',
} as const;

export type PostHogRegion = keyof typeof posthogHosts;
