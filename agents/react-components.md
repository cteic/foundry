# React component architecture

Every cteic React app splits components by job: containers fetch, presentational components render, layout components arrange, and pure functions compute. The rules apply to React web (Next.js) and React Native (Expo) alike. If a repo's own instruction file conflicts, follow the repo and say so in the PR.

## The four kinds

| Kind           | Owns                                                                 | Must not                                                     | Example                                    |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| Container      | Data fetching, server state, effects, navigation, storage, analytics | Render more than a composition of other components           | `WeatherHeroContainer` loads a forecast    |
| Presentational | Rendering its props. Local UI state only                             | Fetch, run effects, read domain data from context or a store | `ConditionWord` renders "Overcast"         |
| Layout         | Arranging children: stacks, grids, page and screen frames            | Take or read domain data                                     | `HeroFrame` stacks its children with a gap |
| Pure function  | Formatting, thresholds, unit conversion, derived labels              | Import React. Read the clock, network or storage directly    | `describeSky(0.9)` returns `'Overcast'`    |

Pure functions live in `lib/` or the repo's data package, never in a component file. A presentational component stays thin because the hard part already ran in a tested function.

### Local UI state

A presentational component may use only these hooks:

| Allowed                                      | Example                             |
| -------------------------------------------- | ----------------------------------- |
| `useState` or `useReducer` for UI-only state | Whether a disclosure is open        |
| `useId`, `useRef`                            | Label ids, focus management         |
| The styling system's theme or media hooks    | Pick a layout for a narrow viewport |

Anything else is container work: `useEffect`, data-library hooks such as `useQuery`, router hooks, storage, analytics, and context that carries domain data. A presentational component that needs to navigate takes an `onSelect` callback and lets its container decide.

## Decide which kind a component is

Answer in order. Stop at the first yes.

1. Does it fetch, subscribe, write storage, navigate or run an effect? It is a container.
2. Does it only place children, with no domain props? It is a layout component.
3. Does it compute a value a test could check without rendering? Move that computation to a pure function, then go back to 1.
4. Otherwise it is presentational.

A component that answers yes to 1 and also renders a long tree is two components. Split it.

## Write a feature in 6 steps

1. Write the pure functions in `lib/` with unit tests. Example: `describeSky`, `formatTemperature`.
2. Write one presentational component per visual piece. Each takes display-ready props: strings, numbers, booleans, callbacks.
3. Compose them in a presentational parent, inside a layout component.
4. Write the container. It fetches, handles loading and error, calls the pure functions, and passes the results down.
5. Test each kind as the testing table below says.
6. Check the file layout and names against the table below.

## Small named components, not inline blocks

Extract a named component when any of these holds:

| Signal                                                        | Do this                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| A JSX return runs past about 40 lines                         | Split it into named child components                        |
| An element carries an inline `style={{ ... }}` object literal | Use the styling system's tokens or a named styled component |
| The same markup appears twice                                 | Extract it once and pass the differences as props           |
| JSX holds a ternary chain, arithmetic or string building      | Move the logic to a pure function in `lib/`                 |

One computed value may stay inline when nothing else can express it. Example: a bar's width from a percentage.

### Worked example: a hero

Avoid this. One component reads raw data, holds the logic and inlines every style:

```tsx
export function WeatherHero({ forecast }: WeatherHeroProps) {
  return (
    <section style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1 style={{ fontSize: 64, fontWeight: 700, margin: 0 }}>
        {Math.round(forecast.temperatureC)}°C
      </h1>
      <p style={{ fontSize: 20, textTransform: 'uppercase', margin: 0 }}>
        {forecast.cloudCover > 0.8 ? 'Overcast' : forecast.cloudCover > 0.3 ? 'Cloudy' : 'Clear'}
      </p>
      <p style={{ fontFamily: 'monospace', fontSize: 14, margin: 0 }}>
        Wind {forecast.windKph} km/h, humidity {Math.round(forecast.humidity * 100)}%
      </p>
    </section>
  );
}
```

It has four problems. The sky threshold cannot be tested without rendering. Three style objects duplicate design tokens. The headline, the condition word and the facts line cannot be reused. The component cannot render without a full forecast object.

Write this instead. The thresholds become a pure function:

```ts
// lib/describe-sky.ts
export type SkyWord = 'Clear' | 'Cloudy' | 'Overcast';

export function describeSky(cloudCover: number): SkyWord {
  if (cloudCover > 0.8) return 'Overcast';
  if (cloudCover > 0.3) return 'Cloudy';
  return 'Clear';
}
```

Each visual piece becomes a named presentational component with display-ready props. `Heading` and `Text` come from the repo's UI package, so the tokens live in one place:

```tsx
// components/headline-value.tsx
export interface HeadlineValueProps {
  value: string;
}

export function HeadlineValue({ value }: HeadlineValueProps) {
  return (
    <Heading level={1} size="display">
      {value}
    </Heading>
  );
}
```

```tsx
// components/facts-line.tsx
export interface Fact {
  label: string;
  value: string;
}

export interface FactsLineProps {
  facts: readonly Fact[];
}

export function FactsLine({ facts }: FactsLineProps) {
  return (
    <Text variant="mono">{facts.map((fact) => `${fact.label} ${fact.value}`).join(', ')}</Text>
  );
}
```

`ConditionWord` follows the same shape. The hero composes them inside a layout component:

```tsx
// components/weather-hero.tsx
export interface WeatherHeroProps {
  temperature: string;
  sky: SkyWord;
  facts: readonly Fact[];
}

export function WeatherHero({ temperature, sky, facts }: WeatherHeroProps) {
  return (
    <HeroFrame>
      <HeadlineValue value={temperature} />
      <ConditionWord word={sky} />
      <FactsLine facts={facts} />
    </HeroFrame>
  );
}
```

The container is the only piece that knows where a forecast comes from. In the Next.js App Router, a server component is a natural container:

```tsx
// components/weather-hero-container.tsx
export interface WeatherHeroContainerProps {
  placeId: string;
}

export async function WeatherHeroContainer({ placeId }: WeatherHeroContainerProps) {
  const forecast = await getForecast(placeId);
  return (
    <WeatherHero
      temperature={formatTemperature(forecast.temperatureC)}
      sky={describeSky(forecast.cloudCover)}
      facts={forecastFacts(forecast)}
    />
  );
}
```

In Expo, the container is a screen or a component that calls a data hook and handles each state:

```tsx
export function WeatherHeroContainer({ placeId }: WeatherHeroContainerProps) {
  const forecast = useForecast(placeId);
  if (forecast.status === 'loading') return <HeroSkeleton />;
  if (forecast.status === 'error') return <LoadError onRetry={forecast.retry} />;
  return (
    <WeatherHero
      temperature={formatTemperature(forecast.data.temperatureC)}
      sky={describeSky(forecast.data.cloudCover)}
      facts={forecastFacts(forecast.data)}
    />
  );
}
```

`WeatherHero` and its children are identical on both platforms. Only the container and the UI primitives differ.

## Web and native

| Concern        | Next.js                                                                                                   | Expo                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Container      | Server component or route `page.tsx`; a client component with a data hook when it must run in the browser | Expo Router screen, or a component that calls a data hook |
| Presentational | Server component by default; add `'use client'` only for local UI state                                   | Plain component                                           |
| Layout         | Page frame, stack, grid from the UI package                                                               | Screen frame with safe areas, stack from the UI package   |
| Styling        | The repo's styling system and tokens, no inline style objects                                             | The same. No inline `style={{ ... }}` either              |
| Pure logic     | `lib/` or the shared data package, imported by both apps                                                  | The same functions                                        |
| Component test | Testing Library for React                                                                                 | Testing Library for React Native                          |

## Files and names

| Rule                                            | Example                                                      |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Kebab-case file names                           | `condition-word.tsx`, not `ConditionWord.tsx`                |
| One exported component per file where practical | `facts-line.tsx` exports `FactsLine` and its props only      |
| Props interface named `ComponentNameProps`      | `FactsLineProps`, destructured in the signature              |
| Containers end in `-container` / `Container`    | `weather-hero-container.tsx` exports `WeatherHeroContainer`  |
| Route entries are containers already            | `app/forecast/page.tsx` needs no suffix                      |
| Layout components sit together                  | `components/layout/hero-frame.tsx`, or the shared UI package |
| Pure functions in `lib/` or the data package    | `lib/describe-sky.ts`                                        |
| Tests sit next to the file they test            | `lib/describe-sky.test.ts`, `components/facts-line.test.tsx` |

The repo's general TypeScript rules still apply: `function` declarations for components, `interface` for props, no `as` casts.

## Test each kind

| Kind           | How                                                                                                                | Example assertion                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Pure function  | Unit test with a table of inputs, including each boundary                                                          | `describeSky(0.8)` is `'Cloudy'`, `describeSky(0.81)` is `'Overcast'` |
| Presentational | Render with props, assert what a user sees by role or text                                                         | `getByRole('heading', { name: '18°C' })` exists                       |
| Container      | Mock the data source at its module or network boundary, assert the rendered outcome for success, loading and error | A failed fetch shows the retry button                                 |
| Layout         | Test only when it holds logic, such as a breakpoint switch. Otherwise visual baselines cover it                    | A narrow viewport stacks the columns                                  |

Assert what renders, not how. A container test that only checks the mock was called once passes when the screen is blank. Most of the tests belong to the pure functions, because they are fast and need no renderer.

## Review checklist

Reviewers and CodeRabbit flag these in `.tsx` and `.jsx` files:

| Finding                                                                                  | Fix                                                  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A component fetches or runs effects and also renders a long tree                         | Split into a container and presentational components |
| A presentational or layout component calls `useEffect`, a data hook, a router or storage | Move it to the container, pass props or callbacks    |
| A layout component takes domain data                                                     | Pass children instead                                |
| Logic inline in JSX: ternary chains, thresholds, unit maths, string building             | A pure function in `lib/` with a unit test           |
| An inline `style={{ ... }}` object literal beyond one computed value                     | Tokens or a named styled component                   |
| A JSX return past about 40 lines                                                         | Named child components                               |

## Existing code

New code follows this guide now. Refactor existing components in small PRs: one component family per PR, behaviour unchanged, titled `refactor(<scope>): ...`. Keep each PR inside the limits in [pr-standards.md](pr-standards.md). Add or move the tests in the same PR, so the refactor proves it changed nothing.
