# @cteic/fix-has-test

Fails when a branch holds a `fix` commit and changes no test file. A bug fix ships with a regression test, so the bug cannot come back unseen. It runs as a CLI, a pre-push hook or a GitHub Action. It uses only Node built-ins and has no runtime dependencies.

```text
fix-has-test: FAIL
  4 commits checked against origin/dev (18fc314)
  1 commit needs a test, and the branch changes no test file

Needs a test
  4f2a9c1  fix(web): stop the export button sending twice

Waived by a No-test line in the commit body
  9ab01cd  fix(ci): pin the runner image
      No-test: workflow file only, nothing to assert

Exempt
  77de012  fix(deps): update dependency zod to v4.1.2
      scope deps, dependency files only

Add a regression test in this branch: one that fails without the fix.
If no test can cover it, say why in the commit body. The reason is reported:
  No-test: <reason>
```

## Install

```sh
pnpm add --save-dev @cteic/fix-has-test
```

Needs Node 24 or later and git.

## Usage

```sh
pnpm exec fix-has-test                       # compare HEAD with origin/HEAD
pnpm exec fix-has-test --base origin/dev     # compare with another ref
pnpm exec fix-has-test --types fix,perf      # check more commit types
pnpm exec fix-has-test --test-globs '*_test.go,*.test.*'
pnpm exec fix-has-test --json                # machine-readable report
pnpm exec fix-has-test --dry-run             # report, but always exit 0
```

## What it checks

`fix-has-test` reads the commits in `<base>..HEAD` and the files the branch changes since the merge base. It fails when both are true:

1. At least one commit is a fix that needs a test.
2. The branch adds or changes no test file.

The test may sit in any commit of the branch. It does not have to be in the fix commit.

**It does not prove that the test fails without the fix.** It does not run anything. It checks that a test file changed, which is the part a machine can check from history. Whether the test covers the bug is for the author and the reviewer: run the new test on the base branch and watch it fail.

### Which commits count as a fix

The subject must follow Conventional Commits. The type is matched without regard to case.

| Subject                             | Counts | Why                                                             |
| ----------------------------------- | ------ | --------------------------------------------------------------- |
| `fix: stop the crash`               | yes    |                                                                 |
| `fix(web): stop the crash`          | yes    | A scope changes nothing                                         |
| `fix!: drop the old flag`           | yes    | A breaking marker changes nothing                               |
| `feat: add export`                  | no     | Not on the `--types` list                                       |
| `Revert "fix(web): stop the crash"` | no     | A revert restores old code. Listed under Ignored                |
| `revert: fix(web): stop the crash`  | no     | The same, in Conventional Commits form                          |
| Any merge commit                    | no     | A merge brings in commits that were checked on their own branch |
| `fixup! fix(web): stop the crash`   | no     | The commit it amends is on the branch and counts                |
| `fix(deps): update dependency zod`  | no     | Exempt when it changes dependency files only. See below         |

### Dependency fixes

Update tools file production dependency bumps under `fix(deps):`. There is no code of yours in such a commit, so there is nothing to write a regression test for. The rule has two parts, and both must hold:

1. The scope is on the `--exempt-scopes` list. The default list is `deps`.
2. Every file the commit changes is a dependency manifest or a lockfile: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `bun.lock`, `bun.lockb`, `Cargo.toml`, `Cargo.lock`, `go.mod`, `go.sum`, `pyproject.toml`, `requirements*.txt`, `uv.lock`, `poetry.lock`, `Gemfile`, `Gemfile.lock`.

A `fix(deps):` commit that also changes source is a code change, so it needs a test like any other fix. The report names the first file that broke the exemption. Pass `--exempt-scopes ''` to exempt nothing.

### Which files count as a test

| Default glob      | Matches                                          |
| ----------------- | ------------------------------------------------ |
| `*.test.*`        | `src/export.test.ts`                             |
| `*.spec.*`        | `e2e/login.spec.ts`                              |
| `*.feature`       | `features/export.feature`                        |
| `**/__tests__/**` | `src/__tests__/export.ts`                        |
| `**/tests/**`     | `tests/export.rs`, `crates/core/tests/export.rs` |

A glob with no `/` matches the file name in any directory. A glob with a `/` matches the whole path from the repo root. `--test-globs` replaces the default list.

Three more rules apply, whatever the globs:

- A deleted test file does not count.
- A snapshot does not count: `*.snap` and `**/__snapshots__/**`. A snapshot update records new output. It does not add a check.
- A Rust file counts when the branch adds a line that opens a test function: `#[test]`, or a path that ends in `::test` such as `#[tokio::test]`. Rust keeps unit tests in the source file, so a glob cannot find them.

### The escape hatch

Some fixes have no test to write: a workflow file, a typo in a log line. Say so in the commit body, on a line of its own:

```text
fix(ci): pin the runner image

The default image moved and broke the build.

No-test: workflow file only, nothing to assert
```

The commit is then waived. A waiver is never silent: every report prints the commit and its reason, and the JSON report holds both. A `No-test:` line with no reason waives nothing. The key matches without regard to case.

### Limits

- It reads commit subjects, not the pull request title. A squash merge whose title says `fix` and whose commits do not is not seen.
- It cannot tell that a changed test file relates to the fix. Any test change on the branch passes every fix on the branch.
- A Rust fix that only edits an existing `#[test]` function, with no new one, is not seen as a test change. Use a `No-test:` line that says where the test is, or add a case as a new function.
- Other languages that keep tests in the source file are not detected. Add a glob if your layout marks them.
- In a shallow clone, commits on the branch can be missing. `fix-has-test` exits 2 and tells you to fetch full history.

## Options

| Option                   | Default                                                               | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `--base <ref>`           | `origin/HEAD`                                                         | Ref to compare with. `origin/HEAD` is the remote's default branch           |
| `--types <list>`         | `fix`                                                                 | Commit types that need a test, comma separated                              |
| `--test-globs <list>`    | `*.test.*`, `*.spec.*`, `*.feature`, `**/__tests__/**`, `**/tests/**` | Globs that mark a test file, comma separated. Repeatable. Replaces the list |
| `--exempt-scopes <list>` | `deps`                                                                | Scopes exempt when the commit changes dependency files only. `''` for none  |
| `--json`                 | off                                                                   | Print the report as JSON                                                    |
| `--dry-run`              | off                                                                   | Report, but always exit 0                                                   |
| `--version`              |                                                                       | Print the version                                                           |
| `--help`                 |                                                                       | Print the help                                                              |

The default base is never a guessed `main` or `dev`. If `origin/HEAD` is not set, `fix-has-test` exits 2 and tells you to run `git remote set-head origin --auto`.

## Exit codes

| Code | Meaning                                                                                     |
| ---- | ------------------------------------------------------------------------------------------- |
| `0`  | No fix commit needs a test, or the branch changes a test file                               |
| `1`  | A fix commit needs a test and the branch changes no test file                               |
| `2`  | Usage error, bad config, a shallow clone, or a git error such as a base ref that is missing |

## Config

Put defaults in `.fix-has-test.json` at the repo root, or under a `fix-has-test` key in `package.json`. `.fix-has-test.json` wins when both exist. A flag replaces the config value.

```json
{
  "base": "origin/dev",
  "types": ["fix"],
  "testGlobs": ["*.test.*", "*.spec.*", "*.feature", "**/__tests__/**", "**/tests/**"],
  "exemptScopes": ["deps"]
}
```

An unknown key is an error, so a typo such as `testGlob` cannot silently fall back to the default.

## JSON report

```json
{
  "verdict": "fail",
  "dryRun": false,
  "base": { "ref": "origin/dev", "sha": "18fc314..." },
  "commits": 4,
  "types": ["fix"],
  "fixes": [
    {
      "hash": "4f2a9c1...",
      "subject": "fix(web): stop the export button sending twice",
      "type": "fix",
      "scope": "web",
      "breaking": false,
      "status": "needs-test",
      "note": ""
    },
    {
      "hash": "9ab01cd...",
      "subject": "fix(ci): pin the runner image",
      "type": "fix",
      "scope": "ci",
      "breaking": false,
      "status": "waived",
      "note": "workflow file only, nothing to assert"
    }
  ],
  "ignored": [{ "hash": "c0ffee1...", "subject": "Merge branch 'dev'", "reason": "merge" }],
  "testFiles": []
}
```

`status` is `needs-test`, `waived` or `exempt`. `note` holds the waiver reason or the exemption reason. `scope` is `null` when the subject has none. `ignored[].reason` is `merge` or `revert`. Each entry of `testFiles` has a `path` and a `reason`, such as `matches *.test.*`. `base.sha` is the merge base.

## Pre-push hook

Save as `.git/hooks/pre-push` and make it executable, or call the same line from your hook manager:

```sh
#!/bin/sh
exec pnpm exec fix-has-test --base origin/dev
```

git stops the push when `fix-has-test` exits 1.

## GitHub Action

The action runs the CLI from this repo at the commit you pin, so it needs no install step. Check out the pull request's head commit with full history. The default checkout is a shallow clone of a merge commit that GitHub makes, and the check exits 2 on it.

```yaml
name: Fix has test

on:
  pull_request:

permissions:
  contents: read

jobs:
  fix-has-test:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
          persist-credentials: false
      - uses: cteic/foundry/packages/fix-has-test@<commit sha>
```

| Input           | Default                        | What it does                                                       |
| --------------- | ------------------------------ | ------------------------------------------------------------------ |
| `base`          | the pull request's base branch | Ref to compare with                                                |
| `types`         | repo config, then `fix`        | Commit types that need a test, comma separated                     |
| `test-globs`    | repo config, then the defaults | Globs that mark a test file, one per line                          |
| `exempt-scopes` | repo config, then `deps`       | Scopes exempt for dependency-only commits. `none` exempts no scope |
| `dry-run`       | `false`                        | Report without failing the job                                     |
| `setup-node`    | `true`                         | Set to `false` when the job already has Node 24 or later           |

The action writes the report to the job log and the job summary. It installs Node 24 with `actions/setup-node`, pinned by commit SHA, which changes the Node version for later steps in the same job. Give it its own job, or set `setup-node: false`.
