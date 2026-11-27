# React Compiler on simply-fpl: size cost against runtime gain

Recorded 2026-11-27 on an Apple M2 Max, 12 cores. One variant ran at a time.

The compiler adds about 20 kB gzipped to each measured route. In return, one real interaction renders 15% faster than the same code without the compiler. Page load metrics do not change.

## Variants

| Variant | Commit                                        | Compiler | Manual memoisation |
| ------- | --------------------------------------------- | -------- | ------------------ |
| on      | `b2ba146` (`feat/react-compiler`)             | on       | 49 sites removed   |
| off     | `b2ba146`, `reactCompiler: false` set locally | off      | 49 sites removed   |
| dev     | `503f204` (merge base on `dev`)               | off      | all in place       |

## Size cost

Gzipped first-load JS from `scripts/check-bundle-budget.mjs` (`pnpm --filter @simplyfpl/web budget:check`), built locally on the branch with the compiler on and off.

| Row               |       On |      Off |   Change | Budget |
| ----------------- | -------: | -------: | -------: | -----: |
| `/` first load    | 494.7 kB | 474.5 kB | +20.2 kB | 475 kB |
| `/h2h` first load | 478.7 kB | 458.7 kB | +20.0 kB | 460 kB |
| All client JS     | 825.5 kB | 776.0 kB | +49.5 kB | 789 kB |

All three rows break the current budget with the compiler on.

## Runtime

### Replay seek: the live-rank view

Method: a `next build --profile` build served by `next start`, in Chrome through Playwright. A stub DevTools hook counts React commits and sums the root fiber's `actualDuration` per commit. The script focuses the seek slider on `/replay` and presses ArrowRight 37 times, 50 ms apart, from GW1 to GW38. One warm-up pass is discarded, then the median of 5 passes is taken. The replay reads static JSON, so no backend is involved.

| Variant | Commits (median) | Render time (median) |      Range |
| ------- | ---------------: | -------------------: | ---------: |
| on      |              222 |               263 ms | 240-275 ms |
| off     |              221 |               311 ms | 310-323 ms |
| dev     |              224 |               307 ms | 274-330 ms |

- On against off: render time falls 48 ms (15%). The change is larger than either range, so it is not noise.
- On against dev: render time falls 44 ms, but dev's range is 56 ms, so this is within noise.
- The commit count does not change. The compiler makes each commit cheaper. It does not remove commits.

### Lighthouse on `/` and `/h2h`

Method: `@lhci/cli` 0.16.1 `collect` with the repo's `apps/web/lighthouserc.json` (5 runs, default mobile emulation, simulated throttling) against `next start` on localhost. The figures are medians.

| Path   | Metric |            On |           Off |            Dev |
| ------ | ------ | ------------: | ------------: | -------------: |
| `/`    | TBT    | 65 ms (43-95) | 65 ms (62-93) | 66 ms (64-102) |
| `/h2h` | TBT    | 49 ms (43-79) | 73 ms (67-76) |  73 ms (71-78) |
| `/h2h` | LCP    |        754 ms |        754 ms |         755 ms |

- TBT on `/h2h` falls 24 ms, but the on range spans 36 ms, so this is within noise.
- LCP on `/` is bimodal: each run lands at about 905 ms or about 4,070 ms. In 10 extra runs, 3 of 10 were slow with the compiler on and 2 of 10 on dev. The slow mode does not depend on the compiler, so no LCP change is quoted.

## Build time

From `pnpm bench:toolchain` against the same base: `build` takes 2.2 s longer (27.4 s to 29.6 s, +8%). Every other step is within noise. One of the six `test` runs on the branch exited non-zero. Six fresh-clone runs and three worktree runs of `pnpm test` all passed, so it is a flaky test, not a compiler effect.

## Options

1. Raise the three budgets to the new sizes plus the same headroom, and record this note as the reason.
2. Set `compilationMode: 'annotation'` and mark the live-rank and replay views with `"use memo"`. Only those views pay the size cost. The removed memoisation outside them would need restoring.
3. Hold the simply-fpl PR.
