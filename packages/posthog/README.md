# @cteic/posthog

Privacy-first PostHog defaults for cteic products. Every app sends only the events it names, with no session replay and no personal data in URLs.

| Entry point                   | What it gives you                                            |
| ----------------------------- | ------------------------------------------------------------ |
| `@cteic/posthog`              | `sanitizePath`, `createTrack`, `posthogHosts`. No SDK needed |
| `@cteic/posthog/web`          | `webOptions` for `posthog.init`, and `capturePageview`       |
| `@cteic/posthog/react-native` | `nativeOptions` for `<PostHogProvider options>`              |

The package imports only types from the SDKs. Install `posthog-js` or `posthog-react-native` in the app yourself.

## Defaults

| Setting             | Web                                              | React Native                              | Why                                              |
| ------------------- | ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------ |
| Autocapture         | Off                                              | Set `autocapture={false}` on the provider | Clicks and inputs can carry personal data        |
| Automatic pageviews | Off                                              | Screens are manual                        | URLs can carry IDs. `capturePageview` masks them |
| Session replay      | Off, and masks all text if a project turns it on | Off                                       | Replay records what people type                  |
| Person profiles     | `identified_only`                                | `identified_only`                         | Stay anonymous until the app calls `identify`    |
| Uncaught exceptions | Captured                                         | Captured, plus unhandled rejections       | One tool for analytics and crashes               |
| Do Not Track        | Respected                                        | Not applicable                            |                                                  |

Pass any option to override a default. The host has no default: each app names its region, so no data lands in the wrong one.

## Web

```ts
import posthog from 'posthog-js';

import { posthogHosts } from '@cteic/posthog';
import { capturePageview, webOptions } from '@cteic/posthog/web';

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, webOptions({ api_host: posthogHosts.eu }));

// On every route change:
capturePageview(posthog, window.location.origin, pathname);
```

The project key (`phc_...`) can only send events, so it is safe in the client bundle. A personal API key reads data: it stays on the server.

## React Native

```tsx
import { PostHogProvider } from 'posthog-react-native';

import { posthogHosts } from '@cteic/posthog';
import { nativeOptions } from '@cteic/posthog/react-native';

<PostHogProvider
  apiKey={key}
  autocapture={false}
  options={nativeOptions({ host: posthogHosts.us, disabled: __DEV__ })}
>
  {children}
</PostHogProvider>;
```

## Typed events

```ts
import { createTrack } from '@cteic/posthog';

interface Events {
  outlook_viewed: { region: string };
  chart_scrubbed: { points: number };
}

const track = createTrack<Events>(posthog);
track('outlook_viewed', { region: 'west' });
track('outlook_viewed', { email: 'pat@example.com' }); // fails typecheck
```

Property values must be strings, numbers, booleans or `null`. A nested object fails typecheck, so nothing personal hides inside one.

## Path masking

`sanitizePath` drops the query string and hash, then masks each segment:

| Segment                                | Becomes  |
| -------------------------------------- | -------- |
| Digits, such as `12345`                | `:id`    |
| A UUID                                 | `:id`    |
| An email                               | `:email` |
| 30 or more letters, digits, `-` or `_` | `:param` |
| A match for an app pattern             | `:param` |

```ts
sanitizePath('/wallet/eth/0xabcdef0123456789ab', { patterns: [/^0x[0-9a-f]{16,}$/i] });
// '/wallet/eth/:param'
```

Consent banners and `identify` stay in the app, because each product decides those for itself.
