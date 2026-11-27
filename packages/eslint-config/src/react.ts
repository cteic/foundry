import type { ESLint, Linter } from 'eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import type { Config } from 'eslint/config';

export interface ReactOptions {
  files?: string[];
}

const defaultFiles = ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'];

const recommended = reactHooks.configs.flat['recommended-latest'];

// The plugin's published types reject its own `configs.flat` entry as an ESLint
// plugin, so register only the parts ESLint reads.
const plugin: ESLint.Plugin = { meta: reactHooks.meta, rules: reactHooks.rules };

function asError(rules: Partial<Linter.RulesRecord> | undefined): Linter.RulesRecord {
  const promoted: Linter.RulesRecord = {};
  for (const [name, entry] of Object.entries(rules ?? {})) {
    if (entry === undefined) {
      continue;
    }
    promoted[name] = Array.isArray(entry) ? ['error', ...entry.slice(1)] : 'error';
  }
  return promoted;
}

export const reactRules: Linter.RulesRecord = asError(recommended.rules);

export function react(options: ReactOptions = {}): Config {
  return {
    files: options.files ?? defaultFiles,
    plugins: { 'react-hooks': plugin },
    rules: reactRules,
  };
}
