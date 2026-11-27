# Testing for agents

A test earns its place by catching a bug a user would hit. Test what the user sees and does, not how the code is built inside. A test that breaks on a rename but passes on a blank screen costs more than it saves.

These rules follow Kent C. Dodds's [Testing JavaScript](https://www.testingjavascript.com/) and the [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles). [pr-standards.md](pr-standards.md) says which tests a PR needs. This file says how to write them.

## The testing trophy

Spend effort where confidence per minute is highest:

| Layer       | What it catches                                 | Tool                                  | Share of effort |
| ----------- | ----------------------------------------------- | ------------------------------------- | --------------- |
| Static      | Typos, wrong types, banned patterns             | TypeScript and `@cteic/eslint-config` | Always on       |
| Unit        | Wrong output from pure logic, at every boundary | Vitest                                | Some            |
| Integration | A feature broken as a user meets it             | Vitest with Testing Library           | Most            |
| End to end  | The main path broken across the deployed app    | Playwright, one smoke path per flow   | Few             |

An integration test renders a whole feature with its real children, and fakes only the network. One such test covers what five shallow component tests would, and it survives a refactor.

## Query like a user

Find elements the way a person or a screen reader would. Use the first query that works:

1. `getByRole`, with a `name`: `getByRole('button', { name: 'Export' })`
2. `getByLabelText` for form fields
3. `getByPlaceholderText`, only when there is no label
4. `getByText` for non-interactive text
5. `getByDisplayValue` for a filled field
6. `getByAltText` or `getByTitle`
7. `getByTestId`, last, and only when nothing a user perceives identifies the element

If `getByRole` cannot find a button, the button is not accessible. Fix the markup, not the query.

Use `queryBy` only to assert that something is absent. Use `findBy` to wait for something to appear.

## Act like a user

- Use `@testing-library/user-event`, not `fireEvent`. `userEvent.type` fires the focus, key and input events a real person does.
- Set it up once per test: `const user = userEvent.setup()`, then `await user.click(...)`.
- Never call a component's handler or set its state directly. Click, type or select, then assert what changed on screen.

## Fake only the edges

| Boundary                         | Fake it with                                    | Never fake                            |
| -------------------------------- | ----------------------------------------------- | ------------------------------------- |
| Network                          | Mock Service Worker handlers, or a fake `fetch` | Your own hooks, components or modules |
| Time                             | `vi.useFakeTimers()` and `vi.setSystemTime()`   | The function under test               |
| Randomness, storage, native APIs | A small fake passed in or set up at the edge    | Anything a user would see             |

A test that mocks your own module checks that your mock works. Assert the outcome on screen, never a mock's call count alone.

## Write each test

- **One behaviour per test.** The name says it: `it('shows a retry button when the forecast fails to load')`.
- **Arrange, act, assert,** in that order, with a blank line between each.
- **A setup function, not a shared `beforeEach`.** Each test calls `renderForecast({ status: 'error' })` and gets back what it needs. Shared mutable state between tests causes order-dependent failures.
- **Flat, not nested.** At most one `describe` level. Deep `describe` trees hide the setup a test runs with.
- **Wait for the result, not a fixed time.** `await screen.findByText('Saved')`, never `sleep(500)`. Put one assertion inside a `waitFor`.
- **Assert specific values.** `toHaveTextContent('18°C')`, not `toBeTruthy()`.

```tsx
function renderForecast(overrides: Partial<Forecast> = {}) {
  server.use(forecastHandler({ ...defaultForecast, ...overrides }));
  const user = userEvent.setup();
  render(<ForecastScreen />);
  return { user };
}

it('shows the temperature for the chosen beach', async () => {
  const { user } = renderForecast({ temperatureC: 18 });

  await user.click(screen.getByRole('button', { name: 'Salthill' }));

  expect(await screen.findByRole('heading', { name: '18°C' })).toBeInTheDocument();
});
```

## What not to test

- Implementation details: internal state, private helpers, which hook a component uses, the order of renders.
- Library code: that React renders or that a router routes.
- Whole-component snapshots. A 300-line snapshot gets approved without being read. A visual baseline or a targeted assertion catches more.
- Styles, unless a style carries behaviour, such as a hidden error message.

## Bugs

Every bug fix starts with a test that reproduces the bug as a user meets it. Run it on the base branch and watch it fail, then fix the code. The test name describes the bug's symptom: `it('keeps the filter when the page reloads')`.

## Flaky tests

A flaky test is a bug. Fix the cause the same day: a missing `await`, shared state, a real timer or a real network call. Never add a retry to hide it. Mark it skipped only with a linked issue and the reason in the skip message.

## Check before the PR

1. Every new behaviour has a test that would fail without the change.
2. No query uses a test ID where a role or label works.
3. No test mocks the repo's own modules.
4. The suite passes three runs in a row: `pnpm test && pnpm test && pnpm test`.
