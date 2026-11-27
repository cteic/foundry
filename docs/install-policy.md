# Install policy

Every cteic repo sets the same pnpm install settings in `pnpm-workspace.yaml`. They make `pnpm install` and `pnpm add` refuse brand-new releases and unapproved install scripts. This covers installs that Renovate does not make: a developer or a coding agent running `pnpm add` by hand.

pnpm cannot inherit workspace settings from a package. So foundry ships the baseline as a documented block plus a check, `@cteic/install-policy`, that fails CI when a repo drifts from it.

These settings need pnpm 11. pnpm 11 reads them only from `pnpm-workspace.yaml`. It reads `.npmrc` for auth, registry, TLS and proxy settings only.

## The baseline

```yaml
minimumReleaseAge: 4320
minimumReleaseAgeExclude:
  - '@cteic/*'
minimumReleaseAgeStrict: true
strictDepBuilds: true
trustPolicy: no-downgrade
blockExoticSubdeps: true
allowBuilds:
  # esbuild downloads its platform binary in postinstall
  esbuild: true
```

## What each setting blocks

| Setting                                | What it blocks                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `minimumReleaseAge: 4320`              | Any version, direct or transitive, published less than 3 days (4320 minutes) ago. This matches Renovate's `minimumReleaseAge` in `default.json`. pnpm also checks the lockfile |
| `minimumReleaseAgeExclude: '@cteic/*'` | Nothing. It lets our own packages install the day they are released                                                                                                            |
| `minimumReleaseAgeStrict: true`        | An install where no version in range is old enough. pnpm fails rather than quietly picking an older version                                                                    |
| `strictDepBuilds: true`                | An install where any dependency has a `preinstall`, `install` or `postinstall` script that `allowBuilds` does not list. pnpm exits non-zero instead of printing a warning      |
| `allowBuilds`                          | The approval list. `true` lets that package's scripts run. `false` blocks them and silences the error. Anything unlisted fails the install                                     |
| `trustPolicy: no-downgrade`            | A version published with weaker trust evidence than earlier versions of the same package, for example without provenance after earlier releases came from trusted publishing   |
| `blockExoticSubdeps: true`             | A transitive dependency that resolves to a git repo or tarball URL. Only direct dependencies may do that, and they show up in review                                           |
| `dangerouslyAllowAllBuilds`            | Must not be `true`. It would run every install script without approval                                                                                                         |

The check also fails these pnpm 10 settings, because pnpm 11 removed them and ignores them: `onlyBuiltDependencies`, `onlyBuiltDependenciesFile`, `neverBuiltDependencies`, `ignoredBuiltDependencies`, `ignoreDepScripts`. A repo that still has them looks protected but is not.

## Attacks it would have stopped

**chalk and debug, September 2025.** An attacker published new versions of 18 packages, including `chalk` and `debug`, with over 2 billion weekly downloads between them. The payload ran in the browser. It intercepted crypto and web3 activity and rewrote payment destinations to the attacker's wallets. A 3-day `minimumReleaseAge` means no cteic install would have resolved them. Write-up: [Aikido Security, "npm debug and chalk packages compromised"](https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised).

**Nx, August 2025.** An attacker took an npm token from a vulnerable GitHub Actions workflow and published malicious `nx` versions. A `postinstall` script scanned the machine for credentials and uploaded them to GitHub. The main versions were live for about 4 hours. Two settings stop this:

- `minimumReleaseAge` would not have resolved versions that young.
- `strictDepBuilds` would have failed the install, because `nx` is not in `allowBuilds`. A repo that approved `nx` by name would still have run the script, so approve only packages that need one.

Earlier Nx releases carried provenance and the attacker published with a stolen token. `trustPolicy: no-downgrade` fails exactly that pattern. The advisory does not say whether the malicious versions lacked provenance, so treat this third layer as unverified for this incident. Write-up: [Nx security advisory GHSA-cxm3-wv7p-598c](https://github.com/nrwl/nx/security/advisories/GHSA-cxm3-wv7p-598c).

**Shai-Hulud, September 2025.** A self-replicating worm compromised over 500 packages. It stole credentials and used them to publish itself into more packages. A worm spreads in hours, so a 3-day wait puts every cteic repo behind its spread window. Write-up: [CISA alert, "Widespread Supply Chain Compromise Impacting npm Ecosystem"](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem).

## Adopt the baseline in a repo

1. Pin pnpm 11 in `package.json`: `"packageManager": "pnpm@11.5.2"`. pnpm 9 and 10 do not support most of these settings.
2. Move the `pnpm` field from `package.json` into `pnpm-workspace.yaml` (`overrides`, `patchedDependencies`, `packageExtensions`, `auditConfig`). Move every non-auth setting out of `.npmrc` too, in camelCase: `engine-strict=true` becomes `engineStrict: true`. pnpm 11 ignores both old places.
3. Paste the baseline block and run `pnpm install --frozen-lockfile`. pnpm checks every lockfile entry against the policy before it installs anything.
4. Fix what it reports:
   - A release younger than 3 days already in the lockfile: add its exact version to `minimumReleaseAgeExclude` with the date it clears, and delete the line after that date.
   - A trust downgrade on an old release, for example `semver@6.3.1` from 2023: newer lines of the same package ship with provenance and the old line never did. Check the publish date on npm, then add the exact version to `trustPolicyExclude` with that date. Two versions of one package share an entry: `'semver@5.7.2 || 6.3.1'`.
   - A recent release flagged as a trust downgrade is the case the setting exists for. Do not exclude it until you know why.
5. Run `pnpm install --no-frozen-lockfile` once. pnpm 11 records patch hashes in a new format, so the lockfile changes without any version moving. pnpm also writes `set this to true or false` placeholders into `allowBuilds`. Replace each with a decision, as in the next section.
6. Run the repo's own format step on `pnpm-lock.yaml` if it formats YAML.

## Approve a new build script

`pnpm install` fails with a list of packages whose install scripts are not approved.

1. Read the script. Find it in `node_modules/.pnpm/<name>@<version>/node_modules/<name>/package.json` under `scripts`, then read the file it runs.
2. Decide whether the package needs it. Most do not. Packages that ship a native binary (`esbuild`, `sharp`, `@swc/core`) or compile a native addon do.
3. Add the package to `allowBuilds` in `pnpm-workspace.yaml`:
   - `true` with a comment saying what the script does and why you need it.
   - `false` if the package works without it. No comment needed.
   - Or run `pnpm approve-builds`, which writes the entry for you. Add the comment afterwards.
4. Run `pnpm install`, then commit `pnpm-workspace.yaml` with the lockfile change.

The check fails a `true` entry that has no comment on the same line or the line above.

```yaml
allowBuilds:
  # sharp downloads libvips for its native image pipeline
  sharp: true
  core-js: false
```

## Take a release younger than 3 days

Sometimes you need a release now, for example a security fix. Renovate raises security PRs at any age, so their install fails until the version is 3 days old.

Add the exact version to `minimumReleaseAgeExclude` with a comment, and delete the entry once the version is 3 days old:

```yaml
minimumReleaseAgeExclude:
  - '@cteic/*'
  - 'next@16.3.2' # fixes GHSA-xxxx-xxxx-xxxx; delete after 2026-12-01
```

The check fails an entry outside `@cteic/` that has no comment. The same rule applies to `trustPolicyExclude` and `trustPolicyIgnoreAfter`.

## Run the check

```sh
pnpm add -D @cteic/install-policy
pnpm exec install-policy
```

Exit code 0 means the repo matches the baseline. 1 means drift, with one line per setting. 2 means `pnpm-workspace.yaml` or `package.json` is missing or unreadable. Add `--json` for machine-readable output.

The check also fails a `packageManager` field older than pnpm 11, because older pnpm ignores `allowBuilds`.
