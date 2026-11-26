import { fileURLToPath } from 'node:url';
import { RuleConfigSeverity, type UserConfig } from '@commitlint/types';

export interface CreateCommitlintConfigOptions {
  scopes?: string[];
}

const conventional = fileURLToPath(import.meta.resolve('@commitlint/config-conventional'));

export function createCommitlintConfig(options: CreateCommitlintConfigOptions = {}): UserConfig {
  if (options.scopes === undefined) {
    return { extends: [conventional] };
  }
  return {
    extends: [conventional],
    rules: {
      'scope-enum': [RuleConfigSeverity.Error, 'always', options.scopes],
    },
  };
}

export default createCommitlintConfig();
