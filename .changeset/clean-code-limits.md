---
'@cteic/eslint-config': major
---

Enforce clean code limits as errors: 300 lines per file (500 for tests), 50 lines per function, 3 parameters, complexity 10 and nesting 3. Generated files are exempt. Add naming rules: kebab-case file names, PascalCase types with no `I` prefix, and `is`, `has`, `should`, `can`, `did`, `will`, `was`, `are` or `does` prefixes on boolean variables.

To adopt it, list each file already over a size limit in the new `oversized` option of `createConfig`. The size rules skip those files only. Rename the booleans and files the naming rules report.
