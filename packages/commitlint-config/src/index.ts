import { fileURLToPath } from 'node:url';
import { RuleConfigSeverity, type Plugin, type Rule, type UserConfig } from '@commitlint/types';

import { creditPatterns, toolNames } from '@cteic/pr-clean';

export interface CreateCommitlintConfigOptions {
  scopes?: string[];
}

const conventional = fileURLToPath(import.meta.resolve('@commitlint/config-conventional'));

export const noToolCreditRule = 'no-tool-credit';

const coAuthor = /^\s*co-authored-by:/i;
const toolCoAuthor = new RegExp(
  `\\b(?:${toolNames.map((name) => name.replaceAll(' ', '[ -]?')).join('|')}|coderabbitai|anthropic\\.com|openai\\.com)\\b`,
  'i'
);
const messagePatterns = creditPatterns.filter(
  (pattern) => pattern.scopes.includes('message') && pattern.id !== 'co-authored-by'
);

export function findToolCredit(message: string): string[] {
  return message.split('\n').filter((line) => {
    if (line.startsWith('#')) {
      return false;
    }
    if (coAuthor.test(line)) {
      return toolCoAuthor.test(line);
    }
    return messagePatterns.some((pattern) => pattern.regex.test(line));
  });
}

const noToolCredit: Rule = (parsed, when = 'always') => {
  const lines = findToolCredit(parsed.raw ?? '');
  const clean = lines.length === 0;
  return [
    when === 'never' ? !clean : clean,
    `the message credits a coding tool. Delete: ${lines.map((line) => line.trim()).join(' | ')}`,
  ];
};

export const toolCreditPlugin: Plugin = { rules: { [noToolCreditRule]: noToolCredit } };

export function createCommitlintConfig(options: CreateCommitlintConfigOptions = {}): UserConfig {
  return {
    extends: [conventional],
    plugins: [toolCreditPlugin],
    rules: {
      [noToolCreditRule]: [RuleConfigSeverity.Error, 'always'],
      ...(options.scopes === undefined
        ? {}
        : { 'scope-enum': [RuleConfigSeverity.Error, 'always', options.scopes] }),
    },
  };
}

export default createCommitlintConfig();
