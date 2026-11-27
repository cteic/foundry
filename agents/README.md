# Agent rules

Product repos link to these files instead of restating them. One source means one place to fix a number.

| File                                       | Holds                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| [pr-standards.md](pr-standards.md)         | Size limits, quality gate, PR title and body, status comment, tests, authorship |
| [react-components.md](react-components.md) | Container, presentational and layout components, pure logic, file names, tests  |
| [clean-code.md](clean-code.md)             | Size limits, names, functions, errors, comments and modules for every file      |

## Link from a product repo

Paste these two lines into the repo's `CLAUDE.md` (and `AGENTS.md` if it has one):

```markdown
## PR standards

Follow https://github.com/cteic/foundry/blob/dev/agents/pr-standards.md for every PR. Do not restate it here.
```

A repo with React code (web or native) also adds:

```markdown
## React components

Follow https://github.com/cteic/foundry/blob/dev/agents/react-components.md for every component. Do not restate it here.
```

Every repo also adds:

```markdown
## Clean code

Follow https://github.com/cteic/foundry/blob/dev/agents/clean-code.md for every file. Do not restate it here.
```

Do not copy the rules into the repo. A copy drifts. If a repo needs a stricter rule, add only that rule next to the link.
