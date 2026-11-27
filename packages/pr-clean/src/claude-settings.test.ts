import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { checkClaudeSettings, claudeSettingsBaseline } from './claude-settings.ts';

function checks(content: string | undefined): string[] {
  return checkClaudeSettings(content).map((finding) => finding.check);
}

describe('checkClaudeSettings', () => {
  it('passes the baseline, with other settings kept', () => {
    const settings = { permissions: { deny: ['Bash(rm:*)'] }, ...claudeSettingsBaseline };

    expect(checks(JSON.stringify(settings))).toEqual([]);
  });

  it('fails a missing file and a file that is not a JSON object', () => {
    expect(checks(undefined)).toEqual(['missing']);
    expect(checks('{ not json')).toEqual(['invalid']);
    expect(checks('[]')).toEqual(['invalid']);
  });

  it('fails each key that is missing or holds another value', () => {
    expect(checks('{}')).toEqual([
      'include-co-authored-by',
      'attribution-commit',
      'attribution-pr',
    ]);
    expect(
      checks(JSON.stringify({ includeCoAuthoredBy: true, attribution: { commit: '', pr: 'x' } }))
    ).toEqual(['include-co-authored-by', 'attribution-pr']);
  });

  it('shows the value it found', () => {
    const [finding] = checkClaudeSettings('{"includeCoAuthoredBy": true}');

    expect(finding?.excerpt).toBe('includeCoAuthoredBy: true');
    expect(finding?.location).toEqual({ kind: 'path', path: '.claude/settings.json' });
  });

  it('matches the baseline file that foundry ships in claude/settings.json', () => {
    const shipped: unknown = JSON.parse(
      readFileSync(new URL('../../../claude/settings.json', import.meta.url), 'utf8')
    );

    expect(shipped).toEqual(claudeSettingsBaseline);
  });
});
