# foundry

Shared engineering foundation for cteic products. Every product repo extends it instead of copying setup.

| Layer              | What lives here                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependency updates | Renovate preset (`default.json`)                                                                                                           |
| Configs            | Shared TypeScript, ESLint, Prettier, Vitest, Playwright and commitlint presets (`packages/`)                                               |
| CI                 | Reusable GitHub Actions workflow for code checks (`.github/workflows/checks.yml`). Audit gate, PR checks and visual regression are planned |

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

## CI

`.github/workflows/checks.yml` is a reusable workflow that only checks code. It installs with pnpm, then runs the format check, lint, typecheck and tests, plus a front-end build when `build-command` is set. Inputs set the Node version, the pnpm version, the working directory and each command. An empty command skips its step. The workflow reads the repo and nothing else: it holds no secrets and never releases or publishes.

Set `rust: true` to add a job that runs `cargo fmt --check`, `cargo clippy` with warnings as errors, and `cargo test` in `rust-working-directory`. That job runs on macOS by default, because a Tauri app compiles there with no system packages and the checks cover the code that ships. For a Linux runner, set `rust-runner` and list the apt packages in `rust-linux-packages`. Call the workflow at a full commit SHA:

```yaml
jobs:
  checks:
    uses: cteic/foundry/.github/workflows/checks.yml@<commit sha>
    with:
      build-command: pnpm build
      rust: true
      rust-working-directory: apps/desktop/src-tauri
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
