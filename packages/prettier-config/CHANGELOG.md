# @cteic/prettier-config

## 1.1.0

### Minor Changes

- 35005df: Ship `prettierignore`, a shared list of generator-owned files, at the `@cteic/prettier-config/prettierignore` subpath export. Pass it to Prettier with `--ignore-path` alongside the repo's own `.prettierignore` to stop the formatter rewriting lockfiles and fighting the package manager over them.

## 1.0.1

### Patch Changes

- edf5d2b: Publish from CI with npm provenance, so each version links to the build that produced it.

## 1.0.0

### Major Changes

- cbd1578: First release of the shared config packages.
