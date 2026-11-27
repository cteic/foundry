import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRuleName, ruleNames, type RuleName } from './rules.ts';

export interface Config {
  base: string | undefined;
  allowAuthors: string[] | undefined;
  skip: string[] | undefined;
  ignore: string[] | undefined;
  emDashFiles: string[] | undefined;
  claudeSettings: boolean | undefined;
}

export interface Options {
  base: string | undefined;
  allowAuthors: string[];
  skip: RuleName[];
  ignore: string[];
  emDashFiles: string[];
  claudeSettings: boolean;
}

export class UsageError extends Error {}

export const defaultEmDashFiles: readonly string[] = ['*.md', '*.mdx', '*.txt'];

export const emptyConfig: Config = {
  base: undefined,
  allowAuthors: undefined,
  skip: undefined,
  ignore: undefined,
  emDashFiles: undefined,
  claudeSettings: undefined,
};

const configKeys = Object.keys(emptyConfig);
const identity = /^[^<>]+ <[^<>\s]+>$/;

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
  if (value.claudeSettings !== undefined && typeof value.claudeSettings !== 'boolean') {
    throw new UsageError(`${source}: claudeSettings must be true or false.`);
  }
  return {
    base: value.base,
    allowAuthors: toStrings(value.allowAuthors, `${source}: allowAuthors`),
    skip: toStrings(value.skip, `${source}: skip`),
    ignore: toStrings(value.ignore, `${source}: ignore`),
    emDashFiles: toStrings(value.emDashFiles, `${source}: emDashFiles`),
    claudeSettings: value.claudeSettings,
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
  const configFile = join(root, '.pr-clean.json');
  if (existsSync(configFile)) {
    return parseConfig(readJson(configFile), '.pr-clean.json');
  }
  const packageFile = join(root, 'package.json');
  if (existsSync(packageFile)) {
    const manifest = readJson(packageFile);
    if (isRecord(manifest) && manifest['pr-clean'] !== undefined) {
      return parseConfig(manifest['pr-clean'], 'package.json "pr-clean"');
    }
  }
  return emptyConfig;
}

export function resolveOptions(flags: Config, config: Config): Options {
  const skip = [...(config.skip ?? []), ...(flags.skip ?? [])].map((name) => {
    if (!isRuleName(name)) {
      throw new UsageError(`Unknown rule "${name}". Rules: ${ruleNames.join(', ')}.`);
    }
    return name;
  });
  const allowAuthors = [...(config.allowAuthors ?? []), ...(flags.allowAuthors ?? [])].map(
    (author) => {
      if (!identity.test(author.trim())) {
        throw new UsageError(`An allowed author must look like "Name <email>". Got "${author}".`);
      }
      return author.trim();
    }
  );
  if (allowAuthors.length === 0 && !skip.includes('author')) {
    throw new UsageError(
      'The author rule needs an allowed list. Pass --allow-author "Name <email>", set allowAuthors in the config, or pass --skip author.'
    );
  }
  return {
    base: flags.base ?? config.base,
    allowAuthors,
    skip,
    ignore: [...(config.ignore ?? []), ...(flags.ignore ?? [])],
    emDashFiles: flags.emDashFiles ?? config.emDashFiles ?? [...defaultEmDashFiles],
    claudeSettings: flags.claudeSettings ?? config.claudeSettings ?? false,
  };
}
