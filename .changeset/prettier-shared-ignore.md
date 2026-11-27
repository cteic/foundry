---
'@cteic/prettier-config': minor
---

Ship `prettierignore`, a shared list of generator-owned files, at the `@cteic/prettier-config/prettierignore` subpath export. Pass it to Prettier with `--ignore-path` alongside the repo's own `.prettierignore` to stop the formatter rewriting lockfiles and fighting the package manager over them.
