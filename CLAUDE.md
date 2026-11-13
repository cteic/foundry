# foundry

pnpm workspace that publishes the `@cteic/*` config packages and holds the Renovate preset (`default.json`).

## Layout

| Path                                  | What it is                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/<name>/src`                 | Package source in TypeScript, built to `dist` with `tsc`. Tests sit next to the source |
| `packages/tsconfig`                   | JSON only, no build                                                                    |
| `packages/eslint-config/src/fixtures` | One file per ESLint ban, plus clean files. Excluded from the repo's own lint           |
| `fixtures/consumer`                   | Private package that installs every preset the way a product repo would                |
| `.changeset`                          | Pending version bumps                                                                  |

The repo uses its own presets: `eslint.config.js`, `prettier.config.js`, `vitest.config.ts` and `tsconfig.json` at the root import from `packages/`.

## Commands

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `pnpm format`       | Write Prettier formatting                          |
| `pnpm format:check` | Fail on unformatted files                          |
| `pnpm lint`         | Build the packages, then run ESLint                |
| `pnpm typecheck`    | Build, then `tsc` in every package and the root    |
| `pnpm test`         | Build, then run every Vitest suite                 |
| `pnpm changeset`    | Record a version bump for the packages you changed |

Lint, typecheck and test build first because the root configs load the packages from `dist`.

## Add an ESLint rule

1. Add the rule to `packages/eslint-config/src/index.ts` at `error`. Never use `warn`: a test fails on any `warn`.
2. For a ban, add `packages/eslint-config/src/fixtures/<rule-name>.ts` that breaks only that rule.
3. Add a `[file, ruleId]` row to the `it.each` table in `packages/eslint-config/src/index.test.ts`.
4. Run `pnpm test`, then `pnpm changeset` and choose a bump for `@cteic/eslint-config`.

A consumer that sets its own `no-restricted-syntax` replaces the `enum` ban, so it must repeat the `TSEnumDeclaration` entry from `bannedRules`.

## Settings

pnpm settings and overrides go in `pnpm-workspace.yaml`. pnpm 11 ignores the `pnpm` field in `package.json`.
