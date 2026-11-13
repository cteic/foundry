# foundry

Shared engineering foundation for cteic products. Every product repo extends it instead of copying setup.

| Layer              | What lives here                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Dependency updates | Renovate preset (`default.json`)                                                                   |
| Configs            | Shared TypeScript, ESLint, Prettier, Vitest, Playwright and commitlint presets (`packages/`)       |
| CI                 | Reusable GitHub Actions workflows: code checks, audit gate, PR checks, visual regression (planned) |

## Config packages

Each package is published to npm under `@cteic`.

| Package                    | What it gives you                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@cteic/tsconfig`          | Strict base: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` |
| `@cteic/eslint-config`     | Flat config with `enum`, `as`, non-null `!` and `any` banned as errors, plus a `boundary()` helper      |
| `@cteic/prettier-config`   | One format config with sorted, grouped imports                                                          |
| `@cteic/vitest-config`     | Node runner defaults, v8 coverage and an optional coverage floor                                        |
| `@cteic/playwright-config` | CI retries and reporters, plus screenshot defaults for visual regression                                |
| `@cteic/commitlint-config` | Conventional Commits, with an optional list of allowed scopes                                           |

### `@cteic/tsconfig`

```json
{ "extends": "@cteic/tsconfig/base.json" }
```

Use `@cteic/tsconfig/react.json` for code that needs the DOM and JSX.

### `@cteic/eslint-config`

```js
import { createConfig } from '@cteic/eslint-config';

export default createConfig({ tsconfigRootDir: import.meta.dirname });
```

Add `boundary({ files, imports, globals, message })` to the array to keep a package free of given imports and globals.

### `@cteic/prettier-config`

```js
// prettier.config.js
export { default } from '@cteic/prettier-config';
```

Imports are sorted by `@ianvs/prettier-plugin-sort-imports`, so adopting the preset reorders imports once.

### `@cteic/vitest-config`

```ts
import { createVitestConfig } from '@cteic/vitest-config';

export default createVitestConfig({
  coverageFloor: { statements: 50, branches: 80, functions: 65, lines: 50 },
});
```

### `@cteic/playwright-config`

```ts
import { createPlaywrightConfig } from '@cteic/playwright-config';

export default createPlaywrightConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
});
```

### `@cteic/commitlint-config`

```js
import { createCommitlintConfig } from '@cteic/commitlint-config';

export default createCommitlintConfig({ scopes: ['web', 'worker', 'deps'] });
```

## Use the Renovate preset

Add `renovate.json` to a repo:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>cteic/foundry"]
}
```

## Release

1. Add a changeset with your change: `pnpm changeset`.
2. On every push to `dev`, the `Release` workflow opens or updates a `chore: version packages` PR into `dev`. Merge it to bump versions and changelogs.
3. Merge `dev` into `main`. The `Release` workflow publishes any version not yet on npm with trusted publishing and pushes the tags.

The first publish needs owner setup on npm: see [docs/publishing.md](docs/publishing.md).

## Licence

Copyright (c) 2026 Pete Watters. Licensed under the GNU Affero General Public License v3.0 only (AGPL-3.0-only). See LICENSE. A commercial licence for use without the AGPL obligations is available from cteic: contact https://github.com/pete-watters.

## Branches

`dev` is the default and integration branch. `main` is production.
