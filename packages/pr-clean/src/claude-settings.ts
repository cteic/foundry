import type { Finding } from './rules.ts';

export const claudeSettingsPath = '.claude/settings.json';

export const claudeSettingsBaseline = {
  includeCoAuthoredBy: false,
  attribution: { commit: '', pr: '' },
} as const;

const baselineText = JSON.stringify(claudeSettingsBaseline);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finding(check: string, message: string, excerpt: string): Finding {
  return {
    rule: 'claude-settings',
    check,
    location: { kind: 'path', path: claudeSettingsPath },
    message,
    excerpt,
  };
}

function shown(value: unknown): string {
  return value === undefined ? 'missing' : JSON.stringify(value);
}

function parse(content: string): unknown {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed;
  } catch {
    return undefined;
  }
}

export function checkClaudeSettings(content: string | undefined): Finding[] {
  if (content === undefined) {
    return [finding('missing', `The repo has no ${claudeSettingsPath}`, baselineText)];
  }
  const settings = parse(content);
  if (!isRecord(settings)) {
    return [finding('invalid', `${claudeSettingsPath} is not a JSON object`, baselineText)];
  }
  const attribution = isRecord(settings.attribution) ? settings.attribution : {};
  const checks = [
    {
      check: 'include-co-authored-by',
      key: 'includeCoAuthoredBy',
      value: settings.includeCoAuthoredBy,
      expected: claudeSettingsBaseline.includeCoAuthoredBy,
    },
    {
      check: 'attribution-commit',
      key: 'attribution.commit',
      value: attribution.commit,
      expected: claudeSettingsBaseline.attribution.commit,
    },
    {
      check: 'attribution-pr',
      key: 'attribution.pr',
      value: attribution.pr,
      expected: claudeSettingsBaseline.attribution.pr,
    },
  ];
  return checks
    .filter(({ value, expected }) => value !== expected)
    .map(({ check, key, value, expected }) =>
      finding(check, `${key} must be ${JSON.stringify(expected)}`, `${key}: ${shown(value)}`)
    );
}
