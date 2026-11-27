# Measurement workflows

Three reusable workflows measure a pull request and post the result as one comment that later runs edit in place.

| Workflow          | Measures                                     | Fails the job                        |
| ----------------- | -------------------------------------------- | ------------------------------------ |
| `lighthouse.yml`  | Page speed of a deployed preview             | When a Lighthouse CI assertion fails |
| `bundle-size.yml` | Build output size, compared with the base    | When the repo's measure script fails |
| `build-bench.yml` | Cold and cached build time, against the base | Never. It is a report                |

The budgets stay in the consuming repo. Foundry holds no budget, no Lighthouse config and no measure script for another repo.

## Rules for every caller

- Call a workflow at a full commit SHA, not a branch.
- Give the calling job `contents: read` and `pull-requests: write`. The run does not start without both.
- No secret is needed. The workflows use the run's own token and nothing else.
- Trigger on `pull_request`. Never use `pull_request_target`: these workflows build and run the pull request's code.
- A pull request from a fork gets no comment, because its token is read only. The same table is in the job summary.
- Every job runs on `ubuntu-24.04`.

Only the comment job can write, and it runs no code from the repo. The job that installs, builds and measures holds a read-only token.

## Set budgets from a measured baseline

A budget that was guessed fails at random or never fails. Before you set one:

1. Measure the current state at least five times and take the median.
2. Record the machine and the exact command next to the budget. For example: "753.5 kB on Node 24, `pnpm build`, CI runner, median of 5".
3. Add headroom that you can justify from the spread of those runs, and write it down too.

Measure on the machine that will enforce the budget. A page that loads in 2 s on a laptop can take 4 s on a shared runner.

## Lighthouse

Loads each path on a deployed preview with Lighthouse CI, then checks the assertions in the repo's config. The comment shows the median LCP, TBT and CLS per page.

```yaml
jobs:
  lighthouse:
    needs: deploy
    permissions:
      contents: read
      pull-requests: write
    uses: cteic/foundry/.github/workflows/lighthouse.yml@<commit sha>
    with:
      url: ${{ needs.deploy.outputs.url }}
      paths: / /pricing
      config: apps/web/lighthouserc.json
```

| Input             | Default             | What it sets                                                    |
| ----------------- | ------------------- | --------------------------------------------------------------- |
| `url`             | required            | Origin of the preview. `https` only, no path, no trailing slash |
| `paths`           | `/`                 | Space-separated paths to test. Each starts with `/`             |
| `config`          | `lighthouserc.json` | Lighthouse CI config file, relative to the repo root            |
| `lhci-version`    | `0.16.1`            | Exact version of `@lhci/cli`                                    |
| `node-version`    | `24`                | Node version                                                    |
| `report-name`     | `lighthouse`        | Name of the comment and prefix of the artifacts                 |
| `timeout-minutes` | `15`                | Time limit for the job                                          |

What the repo provides:

- A deployed preview that answers over `https` without a login. The workflow does not deploy anything. It works with any host.
- A Lighthouse CI config. Set `numberOfRuns` to 5 or more and `aggregationMethod` to `median` on each assertion.
- The budgets, as `maxNumericValue` assertions in that config. The comment reads budgets from a JSON config, under `ci.assert.assertMatrix` or `ci.assert.assertions`. With any other config format the budget column says `none`, and the assertions still decide pass or fail.

The workflow rejects a `url` that is not a plain `https` origin, so `https://preview.example.com/app` and `http://localhost:3000` both fail before anything runs.

The reports are saved for 7 days as the `<report-name>-report` artifact.

## Bundle size

Installs, builds, then runs the repo's measure script on the build output. On a pull request it also measures the base commit and passes that to the script, so the table can show the change.

```yaml
on:
  pull_request:
  push:
    branches: [dev]

jobs:
  bundle-size:
    permissions:
      contents: read
      pull-requests: write
    uses: cteic/foundry/.github/workflows/bundle-size.yml@<commit sha>
    with:
      build-dir: apps/web/dist
```

The `push` trigger on the base branch stores that commit's measurement in the Actions cache. A pull request based on it then builds once. Without the trigger, every pull request builds the base too.

| Input             | Default                           | What it sets                                         |
| ----------------- | --------------------------------- | ---------------------------------------------------- |
| `build-dir`       | required                          | Build output directory, relative to the repo root    |
| `measure-script`  | `scripts/check-bundle-budget.mjs` | Node script that measures a build                    |
| `build-dir-flag`  | `--build-dir`                     | Flag the script takes for the build output directory |
| `build-command`   | `pnpm build`                      | Build command, run from the repo root                |
| `install-command` | `pnpm install --frozen-lockfile`  | Install command                                      |
| `node-version`    | `24`                              | Node version                                         |
| `pnpm-version`    | empty                             | pnpm version. Empty uses `packageManager`            |
| `report-name`     | `bundle-size`                     | Name of the comment, the cache and the artifact      |
| `timeout-minutes` | `20`                              | Time limit for the job                               |

### Measure script contract

The script belongs to the repo, because how to read a build depends on the framework. The workflow runs it with `node` from the repo root and expects this:

| Flag                | The script must                                                          |
| ------------------- | ------------------------------------------------------------------------ |
| `--build-dir <dir>` | Measure the build in `<dir>`, which can be outside the repo checkout     |
| `--json <file>`     | Write its measurements to `<file>`. The format is the script's own       |
| `--base <file>`     | Read a `--json` file from the base commit and show the change against it |
| `--markdown <file>` | Write the report as a Markdown table to `<file>`                         |

- Exit 0 when every budget holds, and non-zero when one is broken. Write the `--json` and `--markdown` files in both cases.
- Never build. The workflow has already built, and it passes the directory.
- Keep the budgets in the script or next to it.

A script that names the directory flag differently, such as `--next-dir`, sets `build-dir-flag`. The base is measured with the pull request's copy of the script, so a change to the script never shows up as a size change.

`scripts/measure-dist-size.mjs` in this repo is a small script that meets the contract.

## Build bench

Times the build with [hyperfine](https://github.com/sharkdp/hyperfine): cold, then cached. On a pull request it times the base commit first, in the same job, and the comment shows the difference.

```yaml
jobs:
  build-bench:
    permissions:
      contents: read
      pull-requests: write
    uses: cteic/foundry/.github/workflows/build-bench.yml@<commit sha>
    with:
      clean-paths: apps/web/dist
      turbo-summary-task: build
```

| Input                | Default                          | What it sets                                                        |
| -------------------- | -------------------------------- | ------------------------------------------------------------------- |
| `build-command`      | `pnpm build`                     | Build command to time, run from the repo root                       |
| `clean-paths`        | empty                            | Space-separated build output paths to delete before each cold run   |
| `runs`               | `3`                              | Timed runs per case, from 1 to 20                                   |
| `turbo-summary-task` | empty                            | Turborepo task for a per-task time report. Empty makes no report    |
| `bench-script`       | empty                            | Repo script to run in place of the built-in bench                   |
| `install-command`    | `pnpm install --frozen-lockfile` | Install command                                                     |
| `node-version`       | `24`                             | Node version                                                        |
| `pnpm-version`       | empty                            | pnpm version. Empty uses `packageManager`                           |
| `hyperfine-version`  | `2.0.0`                          | Exact version of hyperfine                                          |
| `hyperfine-sha256`   | hash of 2.0.0                    | SHA-256 of `hyperfine_<version>_amd64.deb`. Set it with the version |
| `report-name`        | `build-bench`                    | Name of the comment and the artifact                                |
| `timeout-minutes`    | `30`                             | Time limit for the job                                              |

The two cases:

- **cold**: the workflow deletes `clean-paths` and the Turborepo cache before each run.
- **cached**: nothing is deleted, so each run starts from the last build.

Set `clean-paths` to every directory the build writes. If it is empty, the cold case only clears the Turborepo cache, and a build without Turborepo is never cold. The bench points `TURBO_CACHE_DIR` at a directory of its own, which has no effect in a repo without Turborepo.

Build time has no budget. Cold builds of one commit can differ by more than half between two shared runners, so a fixed limit would fail at random. Read a small difference as noise. The job takes about twice the bench time, because it times two commits.

The raw hyperfine results, the machine details and the per-task report are saved for 14 days as the `<report-name>` artifact.

### Bench script contract

The built-in bench lives in the workflow, so the workflow and the bench always come from the same commit. A repo that needs something else sets `bench-script`. The workflow runs it with `bash` from the root of the checkout it must time, and expects this:

| Variable     | The script must                                                |
| ------------ | -------------------------------------------------------------- |
| `BENCH_RUNS` | Time each case that many times                                 |
| `BENCH_OUT`  | Write `summary.json` into that directory. The path is absolute |

`summary.json` holds seconds:

```json
{
  "cold": { "median": 40.09, "min": 40.02, "max": 40.11, "runs": 3 },
  "cached": { "median": 2.28, "min": 2.27, "max": 2.29, "runs": 3 }
}
```

The script must time the checkout it sits in. The workflow copies the pull request's script into a clone of the base commit and runs it there, so both sides use the same script. hyperfine is on the `PATH`. `build-command`, `clean-paths` and `turbo-summary-task` have no effect when `bench-script` is set.

## Sticky comment

`sticky-comment.yml` is the comment step the three workflows share. It can be called on its own: upload an artifact that holds `comment.md`, then call it from a later job.

```yaml
jobs:
  comment:
    needs: report
    permissions:
      pull-requests: write
    uses: cteic/foundry/.github/workflows/sticky-comment.yml@<commit sha>
    with:
      marker: coverage
      artifact: coverage-comment
```

| Input      | Default      | What it sets                                                |
| ---------- | ------------ | ----------------------------------------------------------- |
| `marker`   | required     | Name of the comment. Lower-case letters, digits and hyphens |
| `artifact` | required     | Artifact from the same run that holds the comment body      |
| `file`     | `comment.md` | Markdown file inside the artifact                           |

It keeps one comment per pull request per marker. It only edits a comment that `github-actions[bot]` wrote and that starts with the marker. It does nothing on an event that is not `pull_request`, and nothing on a pull request from a fork.

## Toolchain benchmarks

The workflows above measure one pull request against its base on a shared runner. To compare a toolchain change across every app on one machine, such as TypeScript 7 or Oxlint, use the toolchain bench in [toolchain-benchmarks.md](toolchain-benchmarks.md).
