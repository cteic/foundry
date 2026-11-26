# Shared CodeRabbit config

`base.yaml` is the review config every cteic repo uses. It reviews PRs to `dev` and `main` and keeps the convention and security path instructions.

## What CodeRabbit supports

CodeRabbit has a central configuration feature. It does not fit foundry today, so this repo ships a drift check instead.

| Mechanism         | How it works                                                                                                                           | Why it does not fit                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Central repo      | An org repo named exactly `coderabbit` holds a root `.coderabbit.yaml`. CodeRabbit applies it to every repo with no config of its own. | The repo must be named `coderabbit`, so it cannot be foundry. A repo that has its own `.coderabbit.yaml` ignores it, so a YAML file never extends the base. |
| TypeScript config | A repo's `.coderabbit.config.ts` can compose shared fragments with `includeRemote` and `mergeConfig`.                                  | The documented `includeRemote` examples read from the central `coderabbit` repo, not from foundry.                                                          |

Source: https://docs.coderabbit.ai/configuration/central-configuration

## Sync a repo from the base

Run this from foundry, pointing at a product repo's config:

```sh
node scripts/sync-coderabbit.mjs ../tonnta/.coderabbit.yaml
```

It rewrites the file from `base.yaml` and keeps every line between the `# BEGIN repo-specific` and `# END repo-specific` markers. It prints one of four results:

| Result      | Meaning                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `created`   | The repo had no config. It now has the base                                                 |
| `updated`   | The base changed. The repo-specific lines are kept                                          |
| `unchanged` | The file already matches the base                                                           |
| `replaced`  | The old file had no markers. Check the diff and move any repo-only rules inside the markers |

Commit the result in the product repo with `chore(coderabbit): sync review config from foundry`.

## Use the drift check

1. Create the repo's `.coderabbit.yaml` with the sync command above.
2. Put any repo-specific path rules between the `# BEGIN repo-specific` and `# END repo-specific` lines. Add whole `path_instructions` items only.
3. Run the check with Node 24, no install needed:

```sh
node path/to/foundry/scripts/check-coderabbit-drift.mjs .coderabbit.yaml path/to/foundry/coderabbit/base.yaml
```

It exits 0 when the file matches the base outside the marked region. It exits 1 and prints the first differing line when it drifts. Example: changing `base_branches: [dev, main]` to `[main]` fails.

Example of an allowed addition:

<!-- prettier-ignore -->
```yaml
    # BEGIN repo-specific (extra path_instructions items only; the drift check ignores this region)
    - path: '**/*.sh'
      instructions: >-
        Flag unquoted variable expansions.
    # END repo-specific
```

`pnpm test` runs the sync and drift check tests.

Wiring the check into CI belongs with the reusable workflows (CTE-175).
