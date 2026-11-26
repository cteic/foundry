import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defaultTestGlobs } from './test-files.ts';

export interface Config {
  base: string | undefined;
  types: string[] | undefined;
  testGlobs: string[] | undefined;
  exemptScopes: string[] | undefined;
}

export interface Options {
  base: string | undefined;
  types: string[];
  testGlobs: string[];
  exemptScopes: string[];
}

export class UsageError extends Error {}

export const defaultTypes: readonly string[] = ['fix'];

export const defaultExemptScopes: readonly string[] = ['deps'];

export const emptyConfig: Config = {
  base: undefined,
  types: undefined,
  testGlobs: undefined,
  exemptScopes: undefined,
};

const configKeys = Object.keys(emptyConfig);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStrings(value: unknown, name: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new UsageError(`${name} must be a list of strings.`);
  }
  return value.map((item: unknown) => {
    if (typeof item !== 'string') {
      throw new UsageError(`${name} must hold only strings. Got ${JSON.stringify(item)}.`);
    }
    return item;
  });
}

export function splitList(values: readonly string[] | undefined): string[] | undefined {
  return values
    ?.flatMap((value) => value.split(','))
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

export function parseConfig(value: unknown, source: string): Config {
  if (!isRecord(value)) {
    throw new UsageError(`${source} must hold a JSON object.`);
  }
  const unknownKey = Object.keys(value).find((key) => !configKeys.includes(key));
  if (unknownKey !== undefined) {
    throw new UsageError(
      `${source} has an unknown key "${unknownKey}". Known keys: ${configKeys.join(', ')}.`
    );
  }
  if (value.base !== undefined && typeof value.base !== 'string') {
    throw new UsageError(`${source}: base must be a string.`);
  }
  return {
    base: value.base,
    types: toStrings(value.types, `${source}: types`),
    testGlobs: toStrings(value.testGlobs, `${source}: testGlobs`),
    exemptScopes: toStrings(value.exemptScopes, `${source}: exemptScopes`),
  };
}

function readJson(path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UsageError(`Cannot read ${path}: ${reason}`);
  }
}

export function loadConfig(root: string): Config {
  const configFile = join(root, '.fix-has-test.json');
  if (existsSync(configFile)) {
    return parseConfig(readJson(configFile), '.fix-has-test.json');
  }
  const packageFile = join(root, 'package.json');
  if (existsSync(packageFile)) {
    const manifest = readJson(packageFile);
    if (isRecord(manifest) && manifest['fix-has-test'] !== undefined) {
      return parseConfig(manifest['fix-has-test'], 'package.json "fix-has-test"');
    }
  }
  return emptyConfig;
}

export function resolveOptions(flags: Config, config: Config): Options {
  const types = flags.types ?? config.types ?? [...defaultTypes];
  if (types.length === 0) {
    throw new UsageError('types must name at least one commit type, such as fix.');
  }
  const testGlobs = flags.testGlobs ?? config.testGlobs ?? [...defaultTestGlobs];
  if (testGlobs.length === 0) {
    throw new UsageError('testGlobs must hold at least one glob.');
  }
  return {
    base: flags.base ?? config.base,
    types,
    testGlobs,
    exemptScopes: flags.exemptScopes ?? config.exemptScopes ?? [...defaultExemptScopes],
  };
}
