import js from '@eslint/js';
import type { Linter } from 'eslint';
import type { Config } from 'eslint/config';
import tseslint from 'typescript-eslint';

import { filenameCase } from './filename-case.js';

export interface CreateConfigOptions {
  tsconfigRootDir?: string;
  ignores?: string[];
  /**
   * Files that were over a size limit before the limits landed. The size rules skip only
   * these files, so new code obeys the limits and the list shrinks as files are split.
   */
  oversized?: string[];
}

export interface BoundaryOptions {
  files: string[];
  imports?: string[];
  globals?: string[];
  message: string;
}

const typeScriptFiles = ['**/*.{ts,tsx,mts,cts}'];

const testFiles = [
  '**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  '**/__tests__/**',
  '**/e2e/**',
];

const generatedFiles = ['**/*.generated.*', '**/__generated__/**'];

const defaultIgnores = [
  '**/dist/**',
  '**/node_modules/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.expo/**',
  '**/.turbo/**',
  '**/playwright-report/**',
  '**/test-results/**',
];

export const bannedRules: Linter.RulesRecord = {
  'no-restricted-syntax': [
    'error',
    {
      selector: 'TSEnumDeclaration',
      message: 'Use a const object or a union of literals instead of an enum.',
    },
  ],
  '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
};

/**
 * Size limits a reviewer can hold in their head, set from the measured size of cteic apps.
 * Blank lines and comments do not count.
 */
export const sizeRules: Linter.RulesRecord = {
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': [
    'error',
    { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true },
  ],
  'max-params': ['error', { max: 3 }],
  complexity: ['error', { max: 10 }],
  'max-depth': ['error', { max: 3 }],
};

const sizeRulesOff: Linter.RulesRecord = Object.fromEntries(
  Object.keys(sizeRules).map((name) => [name, 'off'])
);

const booleanPrefixes = ['is', 'has', 'should', 'can', 'did', 'will', 'was', 'are', 'does'];

/** Names that say what a thing is. Type information decides which variables are booleans. */
export const namingRules: Linter.RulesRecord = {
  '@typescript-eslint/naming-convention': [
    'error',
    { selector: 'typeLike', format: ['PascalCase'] },
    {
      selector: 'interface',
      format: ['PascalCase'],
      custom: { regex: '^I[A-Z]', match: false },
    },
    {
      selector: 'variable',
      format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
      leadingUnderscore: 'allow',
    },
    { selector: 'function', format: ['camelCase', 'PascalCase'] },
    { selector: 'parameter', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allow' },
    {
      selector: 'variable',
      types: ['boolean'],
      format: ['PascalCase', 'UPPER_CASE'],
      prefix: [...booleanPrefixes, ...booleanPrefixes.map((prefix) => `${prefix.toUpperCase()}_`)],
    },
    // A destructured name comes from elsewhere, such as props or an API, so it is not checked here.
    { selector: 'variable', modifiers: ['destructured'], format: null },
    // The boolean rule names a type, which outranks a modifier, so destructured booleans repeat the exemption.
    { selector: 'variable', modifiers: ['destructured'], types: ['boolean'], format: null },
    { selector: 'parameter', modifiers: ['destructured'], format: null },
  ],
};

function parserOptionsFor(options: CreateConfigOptions) {
  return options.tsconfigRootDir === undefined
    ? { projectService: true }
    : { projectService: true, tsconfigRootDir: options.tsconfigRootDir };
}

function typeScriptConfigs(options: CreateConfigOptions): Config[] {
  return [
    ...[...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked].map(
      (config) => ({ ...config, files: typeScriptFiles })
    ),
    {
      files: typeScriptFiles,
      languageOptions: { parserOptions: parserOptionsFor(options) },
      rules: {
        ...bannedRules,
        ...namingRules,
        '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      },
    },
  ];
}

function sizeConfigs(options: CreateConfigOptions): Config[] {
  const configs: Config[] = [
    { rules: sizeRules },
    {
      files: testFiles,
      rules: {
        'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
        'max-lines-per-function': 'off',
      },
    },
    { files: generatedFiles, rules: sizeRulesOff },
  ];
  if (options.oversized !== undefined && options.oversized.length > 0) {
    configs.push({ files: options.oversized, rules: sizeRulesOff });
  }
  return configs;
}

export function createConfig(options: CreateConfigOptions = {}): Config[] {
  return [
    { ignores: [...defaultIgnores, ...(options.ignores ?? [])] },
    {
      linterOptions: {
        reportUnusedDisableDirectives: 'error',
        reportUnusedInlineConfigs: 'error',
      },
    },
    js.configs.recommended,
    ...typeScriptConfigs(options),
    {
      plugins: { cteic: { rules: { 'filename-case': filenameCase } } },
      rules: {
        'prefer-const': 'error',
        'no-nested-ternary': 'error',
        'cteic/filename-case': 'error',
      },
    },
    ...sizeConfigs(options),
  ];
}

export function boundary(options: BoundaryOptions): Config {
  const rules: Linter.RulesRecord = {};
  if (options.imports !== undefined && options.imports.length > 0) {
    rules['no-restricted-imports'] = [
      'error',
      { patterns: [{ group: options.imports, message: options.message }] },
    ];
  }
  if (options.globals !== undefined && options.globals.length > 0) {
    rules['no-restricted-globals'] = [
      'error',
      ...options.globals.map((name) => ({ name, message: options.message })),
    ];
  }
  return { files: options.files, rules };
}
