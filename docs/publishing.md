# First publish

The `Release` workflow publishes with npm trusted publishing (OIDC). It holds no npm token. An npm owner must set up the `@cteic` scope and each package once.

## Owner steps

1. Create the `cteic` organisation on npmjs.com, or confirm that the `@cteic` scope is free and yours.
2. Publish each package once by hand, with 2FA, from a clean checkout of `main`:

   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   pnpm --recursive --filter './packages/*' publish --access public
   ```

   This step assumes npm needs a package to exist before you can add a trusted publisher to it. The npm docs set trusted publishers from the package's settings page, which suggests that. **Unverified.** If npm lets you add a trusted publisher to a package that does not exist yet, skip this step.

3. For each of the six packages, open its settings on npmjs.com and add a trusted publisher:

   | Field             | Value          |
   | ----------------- | -------------- |
   | Provider          | GitHub Actions |
   | Organisation      | `cteic`        |
   | Repository        | `foundry`      |
   | Workflow filename | `release.yml`  |
   | Environment       | leave empty    |

4. Optional: in each package's settings, require 2FA and disallow tokens, so only the workflow can publish.

npm does not check the trusted publisher when you save it. A mistake shows up only when the workflow next publishes.

The npm docs also say the first successful publish must happen within 2 days of setting up trusted publishing, or the configuration expires. If it expires before the workflow publishes a new version, add the trusted publisher again.

## Packages

- `@cteic/tsconfig`
- `@cteic/eslint-config`
- `@cteic/prettier-config`
- `@cteic/vitest-config`
- `@cteic/playwright-config`
- `@cteic/commitlint-config`
