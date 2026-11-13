# foundry

Shared engineering foundation for cteic products. Every product repo extends it instead of copying setup.

| Layer | What lives here |
| --- | --- |
| Dependency updates | Renovate preset (`default.json`) |
| Configs | Shared TypeScript, ESLint, Prettier, Vitest, Playwright and commitlint presets (planned) |
| CI | Reusable GitHub Actions workflows: code checks, audit gate, PR checks, visual regression (planned) |

## Use the Renovate preset

Add `renovate.json` to a repo:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>cteic/foundry"]
}
```

## Branches

`dev` is the default and integration branch. `main` is production.
