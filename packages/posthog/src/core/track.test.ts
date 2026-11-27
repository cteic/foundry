import { describe, expect, it } from 'vitest';

import { createTrack, type CaptureClient, type EventValue } from './track.js';

interface Events {
  outlook_viewed: { region: string };
  chart_scrubbed: { points: number };
}

function recorder() {
  const calls: [string, Record<string, EventValue> | undefined][] = [];
  const client: CaptureClient = {
    capture(event, properties) {
      calls.push([event, properties]);
    },
  };
  return { calls, client };
}

describe('createTrack', () => {
  it('sends the event and its properties to the client', () => {
    const { calls, client } = recorder();
    const track = createTrack<Events>(client);

    track('outlook_viewed', { region: 'west' });

    expect(calls).toEqual([['outlook_viewed', { region: 'west' }]]);
  });

  it('rejects unknown events and properties at typecheck', () => {
    const { client } = recorder();
    const track = createTrack<Events>(client);

    // @ts-expect-error: not in the event map
    track('page_viewed', {});
    // @ts-expect-error: email is not a property of outlook_viewed
    track('outlook_viewed', { region: 'west', email: 'pat@example.com' });
  });
});

describe('EventMap', () => {
  it('rejects an event map with a nested object property', () => {
    interface Nested {
      outlook_viewed: { user: { email: string } };
    }
    const { client } = recorder();
    // @ts-expect-error: nested objects are not EventValues
    createTrack<Nested>(client);
  });
});
