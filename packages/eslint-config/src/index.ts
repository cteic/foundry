import js from '@eslint/js';
import type { Linter } from 'eslint';
import type { Config } from 'eslint/config';
import tseslint from 'typescript-eslint';

export interface CreateConfigOptions {
  tsconfigRootDir?: string;
  ignores?: string[];
}

export interface BoundaryOptions {
  files: string[];
  imports?: string[];
  globals?: string[];
  message: string;
}

const typeScriptFiles = ['**/*.{ts,tsx,mts,cts}'];

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

export function createConfig(options: CreateConfigOptions = {}): Config[] {
  const parserOptions =
    options.tsconfigRootDir === undefined
      ? { projectService: true }
      : { projectService: true, tsconfigRootDir: options.tsconfigRootDir };

  return [
    { ignores: [...defaultIgnores, ...(options.ignores ?? [])] },
    {
      linterOptions: {
        reportUnusedDisableDirectives: 'error',
        reportUnusedInlineConfigs: 'error',
      },
    },
    js.configs.recommended,
    ...[...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked].map(
      (config) => ({
        ...config,
        files: typeScriptFiles,
      })
    ),
    {
      files: typeScriptFiles,
      languageOptions: { parserOptions },
      rules: {
        ...bannedRules,
        '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      },
    },
    {
      rules: {
        'prefer-const': 'error',
        'no-nested-ternary': 'error',
      },
    },
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
