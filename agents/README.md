# Agent rules

Product repos link to these files instead of restating them. One source means one place to fix a number.

| File                               | Holds                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| [pr-standards.md](pr-standards.md) | Size limits, quality gate, PR title and body, status comment, tests, authorship |

## Link from a product repo

Paste these two lines into the repo's `CLAUDE.md` (and `AGENTS.md` if it has one):

```markdown
## PR standards

Follow https://github.com/cteic/foundry/blob/dev/agents/pr-standards.md for every PR. Do not restate it here.
```

Do not copy the rules into the repo. A copy drifts. If a repo needs a stricter rule, add only that rule next to the link.
