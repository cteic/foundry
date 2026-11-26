# Working with coding agents

A coding agent can read a repo, run commands, write code and open pull requests. Used well, one engineer can run several streams of work at once and ship them all safely. Used badly, it produces confident, green-looking changes that break production.

This guide teaches the habits that make the difference. Each lesson states a rule, then shows a real case from a cteic repo, then gives you something to practise. The cases come from one day of work on Stackr, a Next.js and Expo monorepo, in November 2026.

The guide is tool-neutral. "Agent" means any coding agent that can run commands in your checkout.

## The short version

| #   | Rule                                                      | One-line reason                                           |
| --- | --------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Give the agent the repo's rules in one instruction file   | It cannot follow conventions it never sees                |
| 2   | Start every task from a fresh fetch                       | Checks on a stale checkout pass and still revert work     |
| 3   | Make every check prove it measured something              | A check that measures nothing passes forever              |
| 4   | Measure before you change, and report before and after    | "Faster" without numbers is a guess                       |
| 5   | Reproduce a failure before you trust a fix                | A fix you never saw fail may fix nothing                  |
| 6   | Pin the environment the build runs in                     | "Latest" changes under you without a commit               |
| 7   | Run parallel work in separate worktrees on disjoint files | Two writers on one file is a merge conflict you scheduled |
| 8   | Test the combination, not only each change                | Twenty green PRs can merge into one red branch            |
| 9   | Review with a second agent, then verify what it claims    | Reviewers are confidently wrong too                       |
| 10  | Write the boundaries down before the agent works alone    | An agent with no limits will reach for settings and prod  |
| 11  | Never ignore a red check because it has always been red   | The day it matters looks the same as every other day      |
| 12  | Report verdict first, and name what you did not verify    | "Done" that hides a gap is worse than "not done"          |

## 1. Give the agent the repo's rules in one instruction file

An agent starts every session knowing nothing about your repo. It reads an instruction file, usually `CLAUDE.md` or `AGENTS.md`, and follows it. Rules that live only in people's heads do not exist for it.

**Case.** Stackr keeps one `CLAUDE.md` at the root and makes `AGENTS.md` a symlink to it, so tools that read either name get the same rules. It says why there are no per-package files: "a second file would only drift from this one." Rules shared across cteic repos are not copied in at all. The repo links to [`agents/pr-standards.md`](../agents/pr-standards.md) in foundry instead.

**How to apply it.**

- Put commands, branch model and hard rules in the file. Example: "Every PR targets `dev`. Never push to `main`."
- Link shared rules. Do not paste them. A pasted copy is out of date the next time the original changes.
- Keep it short. The agent loads it on every task, so every line costs attention.

**Practise.** Open your repo's instruction file. Find one rule the team follows that is not in it. Add it with a concrete example.

## 2. Start every task from a fresh fetch

An agent's checks are only as good as the checkout they ran against. A change built on an old branch passes every local check and still reverts work that merged since.

**Case.** At the end of the day, the main Stackr checkout was 63 commits behind `dev`. Any agent started there would have planned against code that no longer existed.

**How to apply it.** Make the first command of every task:

```sh
git fetch origin && git status -sb
```

If the branch is behind, run `git pull --ff-only`. If that refuses, the branch has diverged. Stop and decide by hand. Do not let the agent resolve it with a merge commit.

**Practise.** Add the fetch line to your instruction file as a mandatory first step.

## 3. Make every check prove it measured something

A check can pass because the code is fine, or because it measured nothing. The second kind is worse than no check, because it tells you the code is fine.

**Case.** Stackr's CI has a bundle budget. A script reads each page's first-load JavaScript size and fails above a ceiling. When the app moved to Next.js 16, Next stopped printing the size column the script parsed. The script found zero routes. It happened to fail with "no route sizes parsed", so every PR went red. Had it been written as "fail if any route is over budget", zero routes would have passed silently, and nobody would have noticed for months.

The fix reads Next's stats file instead, and throws on any shape it does not recognise:

```js
if (!Array.isArray(stats) || !stats.every(isRouteStat)) {
  throw new Error(`unrecognised ${STATS_PATH} shape`);
}
```

**How to apply it.**

- Every check fails when it measured nothing: zero routes, zero files, zero tests.
- When a check stays green across a big upgrade, ask the agent to prove it still measures. "Show me the numbers this check read on the last run."

**Practise.** Pick one CI check. Break its input on purpose, for example by pointing it at an empty folder. Does it fail? If not, fix it.

## 4. Measure before you change, and report before and after

Agents are quick to claim an improvement. Ask for the numbers before the change, after the change, and how they were measured.

**Case.** With the budget measuring again, every Stackr page loaded 700 to 762 kB of gzipped JavaScript. The agent traced the shared 615 kB to the root providers. They loaded wallet libraries (wagmi, RainbowKit, the Solana adapters) on every page, though no page needs them to render. Moving those libraries into a component loaded after first paint gave this:

| Route      | Before   | After    |
| ---------- | -------- | -------- |
| `/account` | 761.5 kB | 469.2 kB |
| `/`        | 715.2 kB | 418.9 kB |
| `/labs`    | 705.0 kB | 399.3 kB |

The first pass left `/labs` at 671.7 kB. Only the per-route table showed that one demo page still imported the libraries directly. A single "average size" would have hidden it.

**What we got wrong.** The new ceiling, 520 kB, came from one local build. [`measurement.md`](measurement.md) says to take the median of five runs on the machine that enforces the budget. The ceiling should be re-derived from CI runs.

**How to apply it.**

- Ask for a per-item table, not a summary number.
- Record the command and the machine next to every number.
- Use the shared `bundle-size.yml`, `lighthouse.yml` and `build-bench.yml` workflows in foundry, so every PR gets the table automatically. See [`measurement.md`](measurement.md).

**Practise.** Ask an agent to find the three heaviest dependencies on your slowest page, with a size for each and the command it used.

## 5. Reproduce a failure before you trust a fix

A fix you never saw fail may fix nothing. It may also work by luck on your machine.

**Case.** Stackr's mobile typecheck failed in CI with 32 errors in files nobody had touched, and passed locally. The cause was install order. pnpm sometimes hoisted React 19's type definitions and sometimes React 18's. The mobile app needs 18. Retrying CI until it passed would have hidden the problem until the next unlucky run.

Instead, the agent:

1. Forced the bad state locally, by pointing the hoisted types at version 19.
2. Saw the same 32 errors as CI.
3. Added the fix: a typecheck-only `tsconfig` that maps `react` to the app's own types.
4. Confirmed 0 errors with version 19 hoisted, then 0 errors with version 18.

It also checked the blast radius. Its first attempt put the mapping in `tsconfig.json`. Expo's bundler reads `paths` from that file at runtime, so the fix would have broken the app itself. The mapping moved to `tsconfig.typecheck.json`, which only the typecheck reads.

**How to apply it.** Before accepting a fix, ask the agent: "Show me it failing without the fix and passing with it." For an environment fix, ask for both environments.

**Practise.** Take the last flaky test your team retried. Ask an agent to reproduce the failing case on purpose.

## 6. Pin the environment the build runs in

"Latest" is a moving target. A runner image, a Node version or a tool can change under you with no commit in your repo.

**Case.** GitHub moved `ubuntu-latest` to Ubuntu 26.04. Playwright does not support it yet, so every end-to-end job in Stackr failed at "install browsers" on the same day, on every PR, with no code change. Pinning the job to `ubuntu-24.04` fixed it. Every job in foundry's shared workflows runs on a pinned image for this reason.

**How to apply it.**

- Pin runner images, Node and the package manager. Stackr pins pnpm through `packageManager` in `package.json`.
- Note when your local tools differ from CI. One local audit "failed" only because the laptop's pnpm was newer than the pinned version and ignored part of `package.json`.

**Practise.** Search your workflows for `-latest`. Pin each one, and note why in a comment.

## 7. Run parallel work in separate worktrees on disjoint files

Agents make parallel work cheap. Git worktrees make it safe: each task gets its own folder and branch, so agents never edit each other's files.

**Case.** One evening, 11 Stackr PRs needed the latest `dev` merged in before their CI could pass. Before updating them all at once, the agent listed the files each PR touched. No two PRs touched the same app file, so all 11 could update and test in parallel. Testing them one after another would have taken about an hour of CI time.

**How to apply it.**

- One worktree per task: `git worktree add ../repo-wt-<task> -b <branch> origin/dev`.
- Check for overlap before running work in parallel. Two branches that touch one file go one after the other.
- Delete a worktree and its branch only after checking the branch tip is in the integration branch:

```sh
git merge-base --is-ancestor <branch> origin/dev && git worktree remove <path>
```

**Practise.** Run two small tasks in two worktrees at the same time. Merge both, then clean up.

## 8. Test the combination, not only each change

Each PR passing CI proves that PR works on the base it was tested against. It says nothing about the PRs that merged after it.

**Case.** 17 Stackr PRs merged within five minutes. None was retested against the others, and `dev` itself had no full check on push. The combined code had never been tested. The agent ran the full gate on `dev` afterwards: lint, typecheck, 1,063 unit tests, formatting and the bundle budget. It passed, but only because the changes happened not to interact.

**Deadlocks happen too.** Three fixes blocked each other: an audit fix, a runner pin and the bundle budget fix. Each needed the other two to pass CI. The agent merged the three branches into one PR, so a single green run proved them together. Their commits stayed intact, and GitHub marked all three as merged.

**How to apply it.**

- Run the full gate on the integration branch after a batch of merges, or have CI do it on push.
- Turn on "require branches to be up to date" if merges come in bursts.

**Practise.** Check whether your integration branch runs the full test suite on every push. If not, add it.

## 9. Review with a second agent, then verify what it claims

A second agent, given the code and not your conclusions, finds things the author missed. Its findings still need checking. Reviewers are confidently wrong too.

**Case.** A reviewer agent checked foundry's measurement workflows. It ranked one finding HIGH: a nested workflow call might break when another repo called it. It said honestly that it could not test this. The documentation did not settle the question either. So the agent ran the experiment. Stackr called the workflow for real, and the comment posted. The HIGH finding was wrong. The other five findings went to the PR, each marked with what had and had not been checked.

**How to apply it.**

- Brief the reviewer with the code and the focus areas, not your opinion of the code. A reviewer told what you think tends to agree.
- For each finding, ask: verified in the code, or a guess? Test the guesses.
- When the docs do not answer a question, write the smallest real test that does.

**Practise.** Ask a reviewer agent to review your last merged PR. Sort its findings into verified and unverified, then test one unverified finding.

## 10. Write the boundaries down before the agent works alone

An agent can keep working while you are away. Before you leave, write down what it may do alone and what it must leave for you.

**Case.** Before a night of unattended work on Stackr, the boundaries were:

| The agent may                                          | The agent must leave for a person                  |
| ------------------------------------------------------ | -------------------------------------------------- |
| Merge into `dev` when CI is green and it read the diff | Release to `main`                                  |
| Open larger work as PRs for review                     | Repository and cloud dashboard settings            |
| Close an issue once its work is merged                 | Product decisions                                  |
| Delete branches whose work is merged                   | Force-push, or merge anything red for a new reason |

At the end, the agent stopped at three items: a repository setting, a cloud build log and a production database migration. Each was a correct stop.

**How to apply it.** Copy the table above into your request and edit it. Name the deciding person for each item on the right.

**Practise.** Before your next long agent task, write the two-column table first.

## 11. Never ignore a red check because it has always been red

A check that is always red teaches everyone to ignore it. Then it fails for a new reason, and nobody looks.

**Case.** Stackr had two such checks:

- The Cloudflare production build had been red since August and was treated as known. The November release merged to `main`, and the build failed again. The production site still ran a months-old build. Nothing looked different from any other day.
- Release automation had failed on every run since June. The cause was one repository setting that stops GitHub Actions from opening pull requests.

**How to apply it.** A check that stays red for more than a week gets one of two outcomes: fixed, or deleted. Never "known".

**Practise.** List every check that has been red for more than a week. Give each one an owner and a date.

## 12. Report verdict first, and name what you did not verify

Agents write long reports. Ask for the answer in the first line and the gaps stated plainly.

**Before:**

> I went ahead and took a look, and it seems likely the build is failing because a dependency was recently updated, though there could be other factors.

**After:**

> The build fails. The `ubuntu-latest` runner moved to 26.04, which Playwright does not support. Not verified: whether any other job uses that image.

**How to apply it.** Put these rules in your instruction file:

- The verdict opens the message.
- One claim per sentence. Name who did what.
- "Unverified" is a fact. State it. Do not hedge around it.
- Tables once more than three items share attributes.

**Practise.** Take the last long agent report you received. Rewrite its first line as the verdict.

## Set up a repo for agent work

A checklist for a team adopting agents on an existing repo.

| Step | What                                                                                     | Done when                                         |
| ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1    | One instruction file, with `AGENTS.md` as a symlink to it                                | Both names open the same content                  |
| 2    | Link [`agents/pr-standards.md`](../agents/pr-standards.md) instead of restating PR rules | The repo file has the two-line link               |
| 3    | Format, lint, typecheck, test and build scripts at the root                              | `pnpm lint` and the others run from a clean clone |
| 4    | CI runs the same scripts, on pinned images                                               | No `-latest` in workflows                         |
| 5    | Measurement workflows from foundry on PRs                                                | PRs show a bundle-size table                      |
| 6    | The integration branch runs the full gate on push                                        | A push to `dev` triggers every check              |
| 7    | No check has been red for more than a week                                               | Each red check has an owner and a date            |

## Run this as a team session

90 minutes, for 3 to 8 engineers, each with an agent on their own machine.

| Time   | Activity                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------- |
| 10 min | Read "The short version" together. Each person picks the rule they break most often                       |
| 20 min | Lesson 3 in pairs: break one CI check's input on purpose and see whether it fails                         |
| 25 min | Lesson 4: each person asks an agent for a before-and-after table on one real page or endpoint             |
| 20 min | Lesson 9: review one merged PR with a reviewer agent, then sort its findings into verified and unverified |
| 15 min | Lesson 11: list every long-red check in the team's repos, with an owner and a date for each               |

Next action after the session: each person adds one missing rule, with an example, to their repo's instruction file.
