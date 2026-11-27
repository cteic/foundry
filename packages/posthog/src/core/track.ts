/** A property value PostHog stores as-is. Objects are left out so nothing nested slips through. */
export type EventValue = string | number | boolean | null;

/**
 * Checks an app's event map: every event's properties must be `EventValue`s.
 * Written as a mapped type so an `interface` passes, not only a `type` alias.
 */
export type EventMap<Events> = {
  [Name in keyof Events]: { [Property in keyof Events[Name]]: EventValue };
};

/** Anything with a PostHog-style `capture`: the web client, the React Native client or a test double. */
export interface CaptureClient {
  capture(event: string, properties?: Record<string, EventValue>): unknown;
}

export type Track<Events extends EventMap<Events>> = <Name extends keyof Events & string>(
  name: Name,
  properties: Events[Name]
) => void;

/**
 * Bind a client to an app's event map, so an unknown event or property fails typecheck.
 *
 * ```ts
 * interface Events { outlook_viewed: { region: string } }
 * const track = createTrack<Events>(posthog);
 * track('outlook_viewed', { region: 'west' });
 * ```
 */
export function createTrack<Events extends EventMap<Events>>(client: CaptureClient): Track<Events> {
  return function track(name, properties) {
    client.capture(name, properties);
  };
}
