# foundry

Shared engineering foundation for cteic products. Every product repo extends it instead of copying setup.

| Layer              | What lives here                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency updates | Renovate preset (`default.json`)                                                                                                                                          |
| Configs            | Shared TypeScript, ESLint, Prettier, Vitest, Playwright and commitlint presets (`packages/`)                                                                              |
| Libraries          | Shared code products import at runtime, starting with `@cteic/charts` (`packages/charts`)                                                                                 |
| CI                 | Reusable GitHub Actions workflows for code checks, page speed, bundle size and build time (`.github/workflows/`). Audit gate, PR checks and visual regression are planned |

## Config packages

Each package is published to npm under `@cteic`.

| Package                    | What it gives you                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@cteic/tsconfig`          | Strict base: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` |
| `@cteic/eslint-config`     | Flat config with `enum`, `as`, non-null `!` and `any` banned as errors, plus a `boundary()` helper      |
| `@cteic/prettier-config`   | One format config with sorted, grouped imports, plus a shared ignore list for lockfiles                 |
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

#### Keep Prettier off lockfiles

The package also ships `prettierignore`, a list of generator-owned files. Point Prettier at it with `--ignore-path` and keep your repo's own `.prettierignore` as a second one:

```json
{
  "scripts": {
    "format": "prettier --write . --ignore-path node_modules/@cteic/prettier-config/prettierignore --ignore-path .prettierignore",
    "format:check": "prettier --check . --ignore-path node_modules/@cteic/prettier-config/prettierignore --ignore-path .prettierignore"
  }
}
```

Pass both paths. Prettier reads `.prettierignore` automatically only while no `--ignore-path` is given, so the first flag silently drops your local ignores unless you name the file again.

| Flag                                                               | Covers                                                                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `--ignore-path node_modules/@cteic/prettier-config/prettierignore` | Lockfiles: `pnpm-lock.yaml`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `bun.lock`, `bun.lockb`, `deno.lock` and `*.lock` |
| `--ignore-path .prettierignore`                                    | Whatever is specific to the repo, such as `dist/`, `coverage/` and `LICENSE`                                                            |

Why it matters: a lockfile has one owner, the package manager. Prettier expands pnpm's inline `resolution: {integrity: sha512-...}` blocks across several lines and flips every quoted key to double quotes, then the next `pnpm install` rewrites them inline. Whichever ran last wins, and the churn hides the real dependency change. On this repo's 2,697-line lockfile Prettier produces a 2,761-line diff that re-resolves nothing.

Patterns resolve against the directory Prettier runs in, not the ignore file's directory, and a pattern with no slash matches at any depth, so a nested `apps/web/pnpm-lock.yaml` is covered too.

Adopting this in a repo whose lockfile Prettier has already reformatted takes one extra step: run the package manager's install once so it rewrites the lockfile in its native form, and commit that with the script change. Without it the next person to install produces the churn you just stopped generating.

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

## Libraries

### `@cteic/charts`

Dependency-free SVG charts. `@cteic/charts/core` turns data into SVG path strings with no React and no DOM. `@cteic/charts/react` wraps them in components: price, line, area, depth and sparkline charts. See [packages/charts/README.md](packages/charts/README.md).

## Use the Renovate preset

Add `renovate.json` to a repo:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>cteic/foundry"]
}
```

The preset rolls out foundry releases faster than other updates:

| Update                                | What Renovate does                                                        |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Any `@cteic/*` release                | One `foundry` PR, opened on any day, first in the queue, after 1 day      |
| `@cteic/*` minor or patch from 1.0    | Merges on its own once checks pass                                        |
| `@cteic/*` patch on 0.x               | Merges on its own once checks pass                                        |
| `@cteic/*` minor on 0.x, or any major | Waits for review                                                          |
| React or Next.js major                | One PR that moves the framework and its types or companion packages       |
| Other minor and patch updates         | One weekly `non-major dependencies` PR, after the usual 3-day release age |

Every package ships its first release as 1.0.0, so a breaking change is always a major. On 0.x, Changesets records a breaking change as a minor bump, which is why 0.x minors wait for review.

### Staged rollout

One app is the canary. It extends the canary preset after the default, so it takes each foundry release as soon as it publishes:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>cteic/foundry", "github>cteic/foundry:canary"]
}
```

Every other app waits 1 day. Pick a canary with the widest test coverage, because its CI is the first check on every release.

### Stop a bad release

If a release breaks the canary, deprecate it on npm before the 1 day passes:

```sh
npm deprecate @cteic/eslint-config@1.4.0 "Broken: use 1.4.1"
```

Renovate does not upgrade an app to a deprecated version (`ignoreDeprecated` is on by default). Publish a fix, and apps move straight to it.

### Auto-merge needs passing checks

Renovate merges foundry PRs itself (`platformAutomerge: false`). It merges only after it sees passing checks. A repo with no checks never auto-merges, so its foundry PRs wait for review. GitHub's native auto-merge is off for these PRs, because it can merge before checks start when a branch has no required checks.

To get auto-merge, an app runs real checks on every PR: the reusable [checks workflow](#ci) covers format, lint, typecheck, tests and build.

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

### Measurement workflows

Three more reusable workflows measure a pull request and keep one comment up to date with the result. The budgets, the Lighthouse config and the measure script stay in the calling repo.

| Workflow          | What it does                                                                   |
| ----------------- | ------------------------------------------------------------------------------ |
| `lighthouse.yml`  | Runs Lighthouse CI against a deployed preview and checks the repo's assertions |
| `bundle-size.yml` | Builds, runs the repo's measure script and shows the change against the base   |
| `build-bench.yml` | Times a cold and a cached build against the base. A report, never a failure    |

```yaml
jobs:
  bundle-size:
    permissions:
      contents: read
      pull-requests: write
    uses: cteic/foundry/.github/workflows/bundle-size.yml@<commit sha>
    with:
      build-dir: apps/web/dist
```

The calling job needs `contents: read` and `pull-requests: write`. No secret is needed. Set a budget only from a measured baseline: the median of at least five runs, with the machine and the command recorded. [docs/measurement.md](docs/measurement.md) has the caller snippet, the inputs and the script contract for each workflow.

## Working with coding agents

[docs/working-with-agents.md](docs/working-with-agents.md) teaches the habits for working with coding agents: twelve rules, each with a real case from a cteic repo and an exercise, plus a repo setup checklist and a 90-minute team session. The rules agents themselves follow live in [agents/](agents/README.md).

## Release

1. Add a changeset with your change: `pnpm changeset`. CI fails a PR that changes a package without one. For a change that ships nothing, such as a test, add an empty one: `pnpm changeset --empty`. Renovate PRs are exempt, so their bumps ship with the next release.
2. On every push to `dev`, the `Release` workflow opens or updates a `chore: version packages` PR into `dev`. Merge it to bump versions and changelogs.
3. Merge `dev` into `main`. The `Release` workflow publishes any version not yet on npm with trusted publishing and pushes the tags.

The first publish needs owner setup on npm: see [docs/publishing.md](docs/publishing.md).

## Licence

Copyright (c) 2026 Pete Watters. Licensed under the GNU Affero General Public License v3.0 only (AGPL-3.0-only). See LICENSE. A commercial licence for use without the AGPL obligations is available from cteic: contact https://github.com/pete-watters.

## Branches

`dev` is the default and integration branch. `main` is production.
