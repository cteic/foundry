# Clean code for agents

Code is read far more often than it is written, and a human reviews every PR. Write code that a reviewer can check in one pass: small files, short functions, names that say what a thing is.

Each rule says how it is checked. **Lint** means `@cteic/eslint-config` fails the build. **Review** means a reviewer checks it, so check it yourself before opening the PR.

## Size

A reviewer holds about one screen of code in their head. These limits keep each unit inside that.

| Unit                   | Limit                                       | Checked by                     |
| ---------------------- | ------------------------------------------- | ------------------------------ |
| File                   | 300 lines, not counting blanks and comments | Lint: `max-lines`              |
| Test file              | 500 lines                                   | Lint: `max-lines`              |
| Function or component  | 50 lines, not counting blanks and comments  | Lint: `max-lines-per-function` |
| Parameters             | 3. Pass one object for more                 | Lint: `max-params`             |
| Branches in a function | Complexity 10                               | Lint: `complexity`             |
| Nesting                | 3 levels                                    | Lint: `max-depth`              |

The limits come from measuring cteic apps: 9 in 10 files were already under 250 lines.

When a file hits a limit, split it by what changes together. Do not move half a function into `utils.ts`.

```ts
// Before: diary.ts, 437 lines, 22 functions covering parsing, scoring and storage.
// After: three files, each with one reason to change.
diary - parse.ts; // text in, entries out
diary - score.ts; // entries in, scores out
diary - store.ts; // reads and writes storage
```

A file that was already over a limit sits on the repo's `oversized` list in `eslint.config.js`. Never add a file to that list. Split it, then delete its line.

## Names

| Rule                                                                                      | Example                                                            | Checked by                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------- |
| File names are kebab-case                                                                 | `session-logger.tsx`, not `SessionLogger.tsx`                      | Lint: `cteic/filename-case` |
| Types and interfaces are PascalCase. No `I` prefix                                        | `Forecast`, not `IForecast`                                        | Lint: `naming-convention`   |
| A boolean starts with `is`, `has`, `should`, `can`, `did`, `will`, `was`, `are` or `does` | `isExpanded`, not `expanded`                                       | Lint: `naming-convention`   |
| A function name is a verb that says what it returns or does                               | `describeSky(cover)`, not `sky(cover)`                             | Review                      |
| A name says what the value is, not its type                                               | `forecasts`, not `forecastArray`                                   | Review                      |
| No abbreviations a newcomer would have to look up                                         | `transaction`, not `txn`                                           | Review                      |
| Single letters only for an index or a short sort callback                                 | `items.sort((a, b) => a.rank - b.rank)`                            | Review                      |
| A magic number or string gets a named constant                                            | `const MAX_RETRIES = 3`                                            | Review                      |
| One word per idea across the codebase                                                     | Always `fetch`, never `fetch`, `get` and `load` for the same thing | Review                      |

A name destructured from props or an API keeps its source's spelling. `({ total_points }) => ...` passes lint.

## Functions

- **Do one thing.** If you describe it with "and", split it. `validateAndSave` becomes `validate` and `save`.
- **One level of abstraction per function.** A function that calls `fetchForecast()` does not also parse JSON by hand.
- **Read top-down.** Put the exported function first and the helpers it calls below it, in the order it calls them.
- **No flag parameters.** `render(true)` hides what `true` means. Write `renderCompact()` and `renderFull()`.
- **No hidden side effects.** A function named `getUser` never writes storage.
- **Return early.** Guard clauses at the top beat an `else` wrapped round the whole body.

```ts
// Before: nested, and the happy path is at depth 3.
function label(session: Session | undefined): string {
  if (session) {
    if (session.score > 0) {
      return `${session.score} points`;
    } else {
      return 'No score';
    }
  }
  return 'No session';
}

// After: guards first, happy path last.
function label(session: Session | undefined): string {
  if (!session) return 'No session';
  if (session.score <= 0) return 'No score';
  return `${session.score} points`;
}
```

## Errors

| Case                                            | Do this                                                                       | Example                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------- |
| A state that should never happen                | `throw` with a message that names the state                                   | Missing required config at startup |
| An expected failure: bad input, an empty lookup | Return `null`, `undefined` or a typed result object                           | `parseDate('soon')` returns `null` |
| React render, a reducer or a selector           | Never throw. Return a fallback, or let an error boundary catch the unexpected |                                    |
| A caught error you cannot handle                | Rethrow it. Never swallow it with an empty `catch`                            |                                    |

## Comments

- Code says what. A comment says why, and only when the code cannot.
- Delete commented-out code. Git keeps the history.
- No comment that restates the next line: `// increment count` above `count += 1`.
- A doc comment on an exported function is welcome when the name alone cannot carry the contract.

## Types and data

These are lint rules in every cteic repo already:

- No `enum`. Use a const object or a union of literals.
- No `as`, no `!` non-null assertion, no `any`. Narrow with a type guard.
- `interface` for object shapes. Component props are named `ComponentNameProps`.
- `function` declarations for top-level functions and components. Arrow functions for callbacks.

Two more for review:

- Prefer immutable updates: `[...items, next]`, not `items.push(next)` on shared data.
- Validate data from outside the program (an API, storage, the URL) once, at the edge, with a type guard. Code past the edge trusts the type.

## Modules

- One reason to change per file. `forecast-format.ts` changes when the display changes, never when the API changes.
- No `index.ts` except a package's public entry point, or where a file-based router requires one.
- Inside a package, import the file you need, not the package's own `index.ts`. Importing your own barrel causes import cycles.
- Delete unused exports. An export with no importer is dead code a reviewer still has to read.

## Before you open the PR

1. Run the repo's format, lint, typecheck and test scripts. All must pass.
2. Read your diff as the reviewer will. Any function you had to scroll to understand is too long.
3. Check every new name against the table above.
4. Follow [pr-standards.md](pr-standards.md) for size, title and body.

## Sources

The rules are my own, drawn from Robert C. Martin's _Clean Code_, the [clean-code-javascript](https://github.com/ryanmcdermott/clean-code-javascript) adaptation, and lessons from production codebases. Where those sources disagree with a rule here, this file wins.
