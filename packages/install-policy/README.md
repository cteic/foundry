# @cteic/install-policy

CLI that fails CI when a repo's pnpm install settings drift from the cteic supply-chain baseline.

The baseline makes `pnpm install` and `pnpm add` refuse releases younger than 3 days, unapproved install scripts, provenance downgrades and git or tarball URLs in transitive dependencies. [docs/install-policy.md](https://github.com/cteic/foundry/blob/dev/docs/install-policy.md) explains each setting.

## Use

```sh
pnpm add -D @cteic/install-policy
pnpm exec install-policy
```

Add the second line to CI after `pnpm install`.

| Option         | What it does                                                         |
| -------------- | -------------------------------------------------------------------- |
| `--root <dir>` | Repo root that holds `pnpm-workspace.yaml`. Default: the current dir |
| `--json`       | Print the report as JSON                                             |
| `--version`    | Print the version                                                    |
| `--help`       | Print help                                                           |

Exit codes: 0 pass, 1 drift, 2 usage error or a missing or unreadable file.

## What it checks

| Setting in `pnpm-workspace.yaml`                                     | Rule                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| `minimumReleaseAge`                                                  | 4320 or more (minutes)                                 |
| `minimumReleaseAgeStrict`, `strictDepBuilds`, `blockExoticSubdeps`   | `true`                                                 |
| `trustPolicy`                                                        | `no-downgrade`                                         |
| `dangerouslyAllowAllBuilds`                                          | Not `true`                                             |
| `allowBuilds`                                                        | Every `true` entry has a comment saying why            |
| `minimumReleaseAgeExclude`                                           | Every entry outside `@cteic/` has a comment saying why |
| `trustPolicyExclude`, `trustPolicyIgnoreAfter`                       | Every entry has a comment saying why                   |
| `onlyBuiltDependencies` and the other build settings pnpm 11 removed | Absent                                                 |

It also fails a `packageManager` field in `package.json` older than `pnpm@11`, because older pnpm ignores `allowBuilds`.

A comment counts when it sits on the entry's line or on the line above it.

## Library

```ts
import { checkWorkspace } from '@cteic/install-policy';

const findings = checkWorkspace(readFileSync('pnpm-workspace.yaml', 'utf8'));
```
