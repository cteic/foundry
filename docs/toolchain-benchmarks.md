# Toolchain benchmarks

The toolchain bench times each app's format check, lint, typecheck, tests and build on one machine, and keeps every result in this repo. A toolchain change, such as TypeScript 7 or Oxlint, is then a before-and-after with the same method, the same machine and a recorded commit.

The results live in `benchmarks/results/<app>/<date>-<label>.json`. [benchmarks/README.md](../benchmarks/README.md) compares each app's baseline with its latest run.

## Record a run

```bash
pnpm bench:toolchain --repo ~/src/tonnta --app tonnta --label baseline
pnpm bench:report
```

| Flag      | Default      | What it sets                                                            |
| --------- | ------------ | ----------------------------------------------------------------------- |
| `--repo`  | required     | A local checkout of the app. Only its `origin` URL and objects are used |
| `--app`   | required     | Name of the results folder, in kebab-case                               |
| `--label` | required     | Name of the run, such as `baseline`, `ts7` or `oxlint`                  |
| `--ref`   | `origin/dev` | Commit, branch or tag to time                                           |
| `--runs`  | `5`          | Timed runs per step, from 3 to 20                                       |
| `--steps` | all five     | Comma-separated subset of `format:check,lint,typecheck,test,build`      |

What one run does:

1. Clones the app fresh at `--ref`, so a local branch, uncommitted change or cache never affects the numbers.
2. Installs with `pnpm install --frozen-lockfile`.
3. Times each step that the app's `package.json` defines with hyperfine: one warm-up, then `--runs` timed runs.
4. Clears every cache before each timed run: Turborepo (`TURBO_FORCE`), `*.tsbuildinfo`, `.eslintcache`, `.next/cache` and `node_modules/.cache`. Each run does the full work.
5. Records the median, min and max, the commit, the machine, the Node and pnpm versions, the tool versions and the TypeScript file and line count.

A step that exits non-zero in any run is marked failed. Its time is kept but never compared, because a failing command can stop early.

## Rules for a fair comparison

- Time the before and the after on the same machine. The report refuses to compare runs from different chips or core counts.
- Close heavy apps and run nothing else while it times. Background load is the largest source of noise on a laptop.
- Plug the laptop in. Battery power throttles the CPU.
- Record the baseline before the change lands. It cannot be measured afterwards.
- Change one thing per label. A run that moves TypeScript and the linter together cannot say which one made it faster.

## Trade-offs: speed is half the answer

A faster tool that catches less is not a straight win. For each toolchain change, record both sides:

| Change       | Speed: time with the bench                     | What it costs: check by hand                                        |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------- |
| TypeScript 7 | `typecheck`, `build`, and `lint` (typed rules) | New type errors, and any tool that still needs the TypeScript 6 API |
| Oxlint       | `lint`                                         | Problems ESLint reports that Oxlint misses, on the same commit      |
| Oxfmt        | `format:check`                                 | Lines whose formatting differs from Prettier                        |

For Oxlint, run both linters on one commit with JSON output, then compare the findings by rule. A rule that ESLint reports and Oxlint does not is lost coverage. Keep ESLint for that rule, or accept the loss in writing.

## Use the numbers outside this repo

Every claim needs its method next to it. The stackr baseline, for example, reads: "Typecheck takes 14.6 s (12.5-17.0 s), median of 5 runs with caches cleared, Apple M2 Max, commit `8d53cab`." A before-and-after claim gives both commits and both medians. Link the results file, which holds the full record.

Quote only a change that the report does not mark within noise.
