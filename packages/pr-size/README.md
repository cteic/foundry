# @cteic/pr-size

Fails when a change is too big to review, and says how to split it. It runs as a CLI, a pre-push hook or a GitHub Action. It uses only Node built-ins and has no runtime dependencies.

```text
pr-size: FAIL
  612 changed lines of 400 allowed
  9 changed files of 25 allowed
  base origin/HEAD (18fc314)

  lines  added  deleted  file
    240    240        0  packages/api/src/export.ts
    180    150       30  packages/web/src/export-button.tsx
    ...

Not counted: 1 file, 310 lines (generated or excluded). --json lists them.

Over the limit by 212 lines. Too big to review in one pass.
Split it by directory, one pull request per group:

  lines  files  directory
    380      5  packages/api
    232      4  packages/web

Move one group to its own branch:
  git switch -c <new-branch> <base>
  git checkout <this-branch> -- <directory>
```

## Install

```sh
pnpm add --save-dev @cteic/pr-size
```

Needs Node 24 or later and git.

## Usage

```sh
pnpm exec pr-size                       # compare HEAD with origin/HEAD
pnpm exec pr-size --base origin/dev     # compare with another ref
pnpm exec pr-size --max-lines 300 --max-files 10
pnpm exec pr-size --json                # machine-readable report
pnpm exec pr-size --dry-run             # report, but always exit 0
```

## What it counts

`pr-size` finds the merge base of the base ref and `HEAD`, then reads `git diff --numstat` between the two. It counts committed changes only. Work on the base branch after the branch point does not count.

- Changed lines are added lines plus deleted lines.
- A renamed file counts only the lines that changed inside it.
- A binary file counts as one file and zero lines.

It leaves out files a reviewer does not read:

| Left out by default       | Matched by                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Lockfiles                 | `pnpm-lock.yaml`, `package-lock.json`, `npm-shrinkwrap.json`, `go.sum`, `*.lock`, `*.lockb`           |
| Snapshots                 | `*.snap`, `**/__snapshots__/**`                                                                       |
| Build output and vendored | `**/dist/**`, `**/vendor/**`, `**/node_modules/**`                                                    |
| Minified files and maps   | `*.min.js`, `*.min.css`, `*.map`                                                                      |
| Images                    | `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.avif`, `*.ico`, `*.svg`                             |
| Files you mark generated  | Any path with `linguist-generated` set in `.gitattributes`, for example `*.gen.ts linguist-generated` |

A glob with no `/` matches the file name in any directory: `*.snap` matches `src/a.snap`. A glob with a `/` matches the whole path from the repo root: `docs/**` matches `docs/guide/a.md`.

## Options

| Option                | Default       | What it does                                                           |
| --------------------- | ------------- | ---------------------------------------------------------------------- |
| `--base <ref>`        | `origin/HEAD` | Ref to compare with. The merge base with `HEAD` is the starting point  |
| `--max-lines <n>`     | `400`         | Most changed lines allowed                                             |
| `--max-files <n>`     | `25`          | Most changed files allowed                                             |
| `--warn-at <0-1>`     | `0.8`         | Fraction of a limit that triggers a warning. `1` turns the warning off |
| `--exclude <glob>`    | none          | Do not count matching paths. Repeatable                                |
| `--include-generated` | off           | Count the files in the table above. `--exclude` still applies          |
| `--json`              | off           | Print the report as JSON                                               |
| `--dry-run`           | off           | Report, but always exit 0                                              |
| `--version`           |               | Print the version                                                      |
| `--help`              |               | Print the help                                                         |

## Exit codes

| Code | Meaning                                                                    |
| ---- | -------------------------------------------------------------------------- |
| `0`  | Within both limits. A warning also exits 0                                 |
| `1`  | Over the line limit or the file limit                                      |
| `2`  | Usage error, bad config, or a git error such as a base ref that is missing |

## Config

Put defaults in `.pr-size.json` at the repo root, or under a `pr-size` key in `package.json`. `.pr-size.json` wins when both exist. A flag beats the config, except `--exclude`, which adds to the config list.

```json
{
  "base": "origin/dev",
  "maxLines": 300,
  "maxFiles": 10,
  "warnAt": 0.8,
  "exclude": ["docs/api/**", "*.generated.ts"],
  "includeGenerated": false
}
```

An unknown key is an error, so a typo such as `maxLine` cannot silently fall back to the default.

## JSON report

```json
{
  "verdict": "fail",
  "dryRun": false,
  "lines": 612,
  "files": 9,
  "limits": { "maxLines": 400, "maxFiles": 25, "warnAt": 0.8 },
  "base": { "ref": "origin/HEAD", "sha": "18fc314..." },
  "counted": [
    {
      "path": "packages/api/src/export.ts",
      "added": 240,
      "deleted": 0,
      "binary": false,
      "lines": 240
    }
  ],
  "excluded": [{ "path": "pnpm-lock.yaml", "lines": 310, "reason": "generated: pnpm-lock.yaml" }],
  "groups": [{ "directory": "packages/api", "lines": 380, "files": 5 }]
}
```

`verdict` is `pass`, `warn` or `fail`. `counted` and `groups` are sorted largest first.

## Pre-push hook

Save as `.git/hooks/pre-push` and make it executable, or call the same line from your hook manager:

```sh
#!/bin/sh
exec pnpm exec pr-size --base origin/dev
```

git stops the push when `pr-size` exits 1.

## GitHub Action

The action runs the CLI from this repo at the commit you pin, so it needs no install step. Check out with full history: the default shallow clone has no merge base.

```yaml
name: PR size

on:
  pull_request:

permissions:
  contents: read

jobs:
  pr-size:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: cteic/foundry/packages/pr-size@<commit sha>
        with:
          max-lines: 400
          max-files: 25
```

| Input               | Default                        | What it does                                             |
| ------------------- | ------------------------------ | -------------------------------------------------------- |
| `base`              | the pull request's base branch | Ref to compare with                                      |
| `max-lines`         | repo config, then `400`        | Most changed lines allowed                               |
| `max-files`         | repo config, then `25`         | Most changed files allowed                               |
| `warn-at`           | repo config, then `0.8`        | Fraction of a limit that triggers a warning              |
| `exclude`           | none                           | Globs to leave out, one per line                         |
| `include-generated` | `false`                        | Count generated files                                    |
| `dry-run`           | `false`                        | Report without failing the job                           |
| `setup-node`        | `true`                         | Set to `false` when the job already has Node 24 or later |

The action writes the report to the job log and the job summary. It installs Node 24 with `actions/setup-node`, pinned by commit SHA, which changes the Node version for later steps in the same job. Give it its own job, or set `setup-node: false`.
