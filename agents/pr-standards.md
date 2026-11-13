# PR standards for agents

Follow these rules to open a PR in any cteic repo. If a repo's own instruction file conflicts, follow the repo and say so in the PR.

## Open a PR in 9 steps

1. Fetch and fast-forward: `git fetch origin && git status -sb`. Use `git pull --ff-only`. If it refuses, stop and report.
2. Branch off the repo's integration branch (`origin/HEAD`, usually `dev`). Name it `feat/*`, `fix/*`, `chore/*`, `docs/*` or `ci/*`.
3. Check the size (next section). Split before opening if it is too large.
4. Run the quality gate (below). Fix failures. Do not open a PR on red.
5. Check authorship: `git log origin/dev..HEAD --format='%an <%ae>'` prints only `Pete Watters <2938440+pete-watters@users.noreply.github.com>`.
6. Open the PR with a title and body in the formats below.
7. Assign it: `gh pr edit <N> --add-assignee pete-watters`.
8. Post the status comment (format below).
9. Do not merge. Ask Pete.

## Size limits

Measure the branch against its base, not just staged changes:

```sh
base=$(git merge-base HEAD "origin/${BASE:-dev}")
git diff --stat "$base"..HEAD | tail -1
```

| Verdict | Files | Lines |
| --- | --- | --- |
| Ideal | fewer than 5 | fewer than 300 |
| Acceptable | fewer than 10 | fewer than 500 |
| Too large, split it | 10 or more | 500 or more |

Do not count generated files: `*.lock`, `dist/`, snapshots. Count the diff a human reviews.

If the PR is too large, propose a split and confirm it with Pete before you open anything. Group by concern: refactor, feature, test, config. Open the prep or refactor PR first. Merge small PRs fast so the base does not move under you.

### Worked example: splitting an oversized PR

A branch adds CSV export. The diff is 14 files and 820 lines, so it is too large.

| PR | Concern | Files | Lines | Base |
| --- | --- | --- | --- | --- |
| 1. `refactor(api): extract report query builder` | Prep, no behaviour change | 3 | 140 | `dev` |
| 2. `feat(api): add CSV export endpoint` | Feature plus its tests | 4 | 260 | PR 1 branch |
| 3. `feat(web): add export button` | UI plus visual baselines | 5 | 210 | PR 2 branch |
| 4. `chore(config): add export feature flag` | Config | 2 | 40 | `dev` |

Each PR is ideal or acceptable. PR 4 has no dependency, so it merges first. After PR 1 merges, retarget PR 2 to `dev`, and so on down the stack. Before each merge, check `git diff dev..branch` to confirm a stale branch does not revert merged work.

## Quality gate

Detect the package manager from the lockfile. Run only the scripts the repo defines, in this order:

| Step | Check |
| --- | --- |
| 1 | format |
| 2 | lint |
| 3 | typecheck (`tsc --noEmit`) |
| 4 | test |
| 5 | build |

Example: `pnpm run --if-present format && pnpm run --if-present lint`. Do not report done until all pass. If a step cannot run locally (a symlinked `node_modules` worktree where the bundler fails), grep your own diff for forbidden patterns (`any`, `as` casts, `console.*`, debug leftovers), then name the step you skipped in the Verification section.

Before review, run the formatter and `lint --fix`, then re-read the diff.

## Title

Conventional Commits with a scope. Imperative mood. No trailing period.

| Good | Bad |
| --- | --- |
| `feat(web): add export button` | `Added export button.` |
| `fix(worker): retry on 429` | `fix: stuff` |
| `docs(agents): add PR standards` | `Docs update` |

Use `feat`, `fix`, `chore`, `docs`, `ci`, `refactor` or `test`. Match the repo's log if it differs.

## Body

Two sections. Nothing else, and no "Test Plan" unless a person wrote it.

```markdown
## Summary
- Add CSV export endpoint for reports
- Reuse the shared query builder so filters match the table

## Linked issue
Closes CTE-123
```

| Link | Effect |
| --- | --- |
| `Closes CTE-123` | Closes the issue on merge |
| `Refs CTE-123` | Links without closing |
| `Closes #45` | Only in repos that still track work in GitHub Issues |
| `Type: chore` | Work with no issue |

The issue ID uses team key `CTE`. The magic word must sit in the PR title or description. In a comment it does nothing.

## Status comment

Post this right after you open the PR. Start with `@pete-watters`.

```markdown
@pete-watters

**Shipped**
- CSV export endpoint and tests

**Pending**
- Decision: keep the 10,000 row cap?

**Verification**
- format, lint, typecheck, test, build pass
- Manual: set `EXPORT_BUCKET` in the preview environment
```

| Section | Holds |
| --- | --- |
| Shipped | What landed in this PR |
| Pending | Decisions, blockers, open questions. Write "None" if empty |
| Verification | What passed, which step you skipped and why, any manual step Pete must take (env vars, signups, smoke URLs, migrations) |

Decisions, open questions and unverified notes go in the status comment or a Linear issue, never in repo files. A README describes the repo as it is. Example: "Decision: create a central config repo?" belongs in a Linear issue, not in `README.md`.

## Tests

| Change | Required test | Example |
| --- | --- | --- |
| New feature or user flow | At least one test of observable behaviour. Use `.feature` plus step definitions where the repo uses BDD | A user clicks Export and receives a CSV with the filtered rows |
| Bug fix | A regression test that fails without the fix | Run it on the base branch first and watch it fail, then fix |
| UI change | Update the visual baselines | Add the `update-snapshots` label to the PR |

Write the tests in the same PR. Do not defer them to a follow-up. Assert behaviour, not internals: no mock call counts standing in for outcomes.

To update baselines: `gh pr edit <N> --add-label update-snapshots`. Then review the baseline diff like any other change.

## Authorship and attribution

| Rule | Check |
| --- | --- |
| Commits are authored as Pete Watters | `git config user.name "Pete Watters"` and `git config user.email "2938440+pete-watters@users.noreply.github.com"` before any commit |
| No AI or tool credit anywhere public | No `Co-Authored-By` trailer, no "Generated with" line, no tool names in commits, PRs, issues or docs |
| Verify before asking for merge | `git log origin/dev..HEAD --format='%an <%ae>'` shows only Pete |

Setting `git config` is the only control over authorship. A `.mailmap` does not change the commit object.

## Never in a PR

- Another client, employer or repo named in any commit, PR, issue or doc.
- A secret in the client bundle (`NEXT_PUBLIC_*`, `VITE_*`, `EXPO_PUBLIC_*`). Secret-bearing calls go through a server route.
- An em dash (U+2014).
