---
'@cteic/pr-clean': minor
---

Add the opt-in `claude-settings` rule. With `--claude-settings` or `"claudeSettings": true`, pr-clean fails when `.claude/settings.json` is missing or does not set `includeCoAuthoredBy` to `false` and `attribution.commit` and `attribution.pr` to `""`. Export the baseline as `claudeSettingsBaseline`. Add CodeRabbit to the known coding tool names.
