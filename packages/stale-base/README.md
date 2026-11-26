# @cteic/stale-base

Fails when a branch is built on an old base. A change made on a stale checkout passes every local check and can still break or undo work that landed on the base after you branched: the checks were right, the baseline was not. It runs as a CLI, a pre-push hook or a GitHub Action. It uses only Node built-ins and has no runtime dependencies.

```text
stale-base: FAIL
  feat/export is 7 commits behind origin/dev and 3 ahead
  merge base 18fc314, committed 2026-11-02, 24 days ago
  merge with origin/dev: conflict in 1 file
  origin/dev as of the last fetch. Pass --fetch to update it first

Changed on origin/dev since the merge base, and also changed on this branch:
  packages/api/src/export.ts  (conflict)
  packages/api/src/report-query.ts
  pnpm-lock.yaml

7 commits behind, 0 allowed. Update the branch:
  git rebase origin/dev
  git merge origin/dev    # if the branch is shared
Then run the checks again. The old results describe the old base.
```

## Install

```sh
pnpm add --save-dev @cteic/stale-base
```

Needs Node 24 or later and git 2.38 or later.

## Usage

```sh
pnpm exec stale-base                     # compare HEAD with the remote's default branch
pnpm exec stale-base --fetch             # fetch the base first
pnpm exec stale-base --base origin/main  # compare with another ref
pnpm exec stale-base --max-behind 10     # allow a branch up to 10 commits behind
pnpm exec stale-base --json              # machine-readable report
pnpm exec stale-base --dry-run           # report, but always exit 0
```

## What it checks

`stale-base` reads committed history only. It never changes the working tree, the index or any branch.

| Reported                     | How it is found                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Commits behind and ahead     | `git rev-list --left-right --count <base>...HEAD`                                                                      |
| Merge base, its date and age | `git merge-base <base> HEAD`, then the committer date of that commit                                                   |
| Overlapping files            | Paths changed on the base since the merge base that the branch also changes. A rename counts as both of its paths      |
| Merge result                 | `git merge-tree --write-tree <base> HEAD`: the merge git would make, done in memory. `clean`, or the files in conflict |

The verdict comes from two facts:

| Verdict | When                                                                                             | Exit |
| ------- | ------------------------------------------------------------------------------------------------ | ---- |
| `fail`  | The branch is more than `--max-behind` commits behind, or the merge with the base would conflict | `1`  |
| `warn`  | The branch is behind, inside the allowance, and the base changed a file the branch changes       | `0`  |
| `pass`  | Anything else                                                                                    | `0`  |

The age of the merge base is information, not a rule. A branch cut today from a base that last moved a month ago has a month-old merge base and is 0 commits behind.

### Why the default is 0 commits behind

Any commit on the base that the branch lacks means the local checks ran against a tree that will not exist after the merge. Example: the base renames a function in one file, and the branch adds a call to the old name in another file. No file overlaps, the merge is clean, both sides pass their checks, and the merged code does not compile. Only "0 behind" rules that out, so that is the default.

Raise the limit where the default is too strict. A repo that merges many pull requests a day can set `--max-behind 20` in CI: a branch inside the allowance still fails on a conflict and still warns on an overlapping file.

### The base

With no `--base`, the base is the branch `origin/HEAD` points to: the default branch of the remote, as the clone recorded it. `stale-base` never guesses `main` or `dev`. If `origin/HEAD` is not set, it exits 2 and tells you to run `git remote set-head origin --auto`.

The check is only as fresh as the last fetch. `--fetch` runs `git fetch <remote>` for the remote in the base ref before it compares. It is off by default so the check works offline and never surprises a hook with network access.

### What it does not check

- It does not flag single lines that a merge would revert. A clean three-way merge keeps every change the base made, so there is nothing to flag there. A revert that already sits inside the branch, such as a conflict that an earlier merge resolved the wrong way, looks the same to git as a change you meant. No plumbing command can tell the two apart. Read `git diff <base>...HEAD` for that.
- It does not run your tests against the merged result. It tells you the earlier results are out of date.
- The merge result follows git's default merge. A custom merge driver in `.gitattributes` or another merge strategy can give a different result.
- When two branches have more than one merge base, it reports the one `git merge-base` picks.

### Shallow clones

In a shallow clone the history is cut, so the merge base and the counts can be wrong. `stale-base` exits 2 and tells you to fetch full history. It does not answer from partial history.

### Worktrees

It works in a linked worktree and reports that worktree's branch. It reads `.stale-base.json` from the worktree's own root.

## Options

| Option             | Default                            | What it does                                   |
| ------------------ | ---------------------------------- | ---------------------------------------------- |
| `--base <ref>`     | the branch `origin/HEAD` points to | Ref the branch must be up to date with         |
| `--max-behind <n>` | `0`                                | Most commits the branch may be behind the base |
| `--fetch`          | off                                | Fetch the base's remote first                  |
| `--json`           | off                                | Print the report as JSON                       |
| `--dry-run`        | off                                | Report, but always exit 0                      |
| `--version`        |                                    | Print the version                              |
| `--help`           |                                    | Print the help                                 |

## Exit codes

| Code | Meaning                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- |
| `0`  | Inside the allowance and the merge is clean. A warning also exits 0                                 |
| `1`  | Too far behind, or the merge with the base would conflict                                           |
| `2`  | Usage error, bad config, a shallow clone, a failed fetch, or a git error such as a missing base ref |

## Config

Put defaults in `.stale-base.json` at the repo root, or under a `stale-base` key in `package.json`. `.stale-base.json` wins when both exist. A flag beats the config.

```json
{
  "base": "origin/dev",
  "maxBehind": 0,
  "fetch": false
}
```

An unknown key is an error, so a typo such as `maxBehnd` cannot silently fall back to the default.

## JSON report

```json
{
  "verdict": "fail",
  "dryRun": false,
  "behind": 7,
  "ahead": 3,
  "maxBehind": 0,
  "fetched": false,
  "base": { "ref": "origin/dev", "sha": "5d0c2aa..." },
  "head": { "ref": "feat/export", "sha": "9be41f7..." },
  "mergeBase": { "sha": "18fc314...", "date": "2026-11-02T09:14:07.000Z", "ageDays": 24 },
  "merge": { "status": "conflict", "conflicts": ["packages/api/src/export.ts"] },
  "changedOnBase": 12,
  "changedOnBranch": 5,
  "overlap": [
    { "path": "packages/api/src/export.ts", "conflict": true },
    { "path": "packages/api/src/report-query.ts", "conflict": false },
    { "path": "pnpm-lock.yaml", "conflict": false }
  ]
}
```

`verdict` is `pass`, `warn` or `fail`. `merge.status` is `clean`, `conflict` or `unknown`. It is `unknown` when git is older than 2.38 and cannot run the in-memory merge. `head.ref` is `HEAD` when the checkout is detached. `changedOnBase` and `changedOnBranch` count the files each side changed since the merge base.

## Pre-push hook

Save as `.git/hooks/pre-push` and make it executable, or call the same line from your hook manager:

```sh
#!/bin/sh
exec pnpm exec stale-base --fetch
```

git stops the push when `stale-base` exits 1.

## GitHub Action

The action runs the CLI from this repo at the commit you pin, so it needs no install step. Two checkout settings matter:

- `ref` must be the pull request's head commit. The default checkout is a merge commit that GitHub makes on top of the base, and that commit is never behind.
- `fetch-depth: 0` fetches full history. The default shallow clone exits 2.

```yaml
name: Stale base

on:
  pull_request:

permissions:
  contents: read

jobs:
  stale-base:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
          persist-credentials: false
      - uses: cteic/foundry/packages/stale-base@<commit sha>
        with:
          max-behind: 20
```

| Input        | Default                        | What it does                                             |
| ------------ | ------------------------------ | -------------------------------------------------------- |
| `base`       | the pull request's base branch | Ref the branch must be up to date with                   |
| `max-behind` | repo config, then `0`          | Most commits the branch may be behind the base           |
| `fetch`      | `false`                        | Fetch the base's remote first. The checkout already did  |
| `dry-run`    | `false`                        | Report without failing the job                           |
| `setup-node` | `true`                         | Set to `false` when the job already has Node 24 or later |

The action writes the report to the job log and the job summary. It installs Node 24 with `actions/setup-node`, pinned by commit SHA, which changes the Node version for later steps in the same job. Give it its own job, or set `setup-node: false`.

A pull request check runs when the branch changes, not when the base moves. A branch that was up to date when it last ran can be behind by the time you merge. Run the check again before the merge, or let the hook catch it on the next push.
