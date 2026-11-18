import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defaultLimits, type Limits } from './size.ts';

export interface Config {
  base: string | undefined;
  maxLines: number | undefined;
  maxFiles: number | undefined;
  warnAt: number | undefined;
  exclude: string[] | undefined;
  includeGenerated: boolean | undefined;
}

export interface Options {
  base: string | undefined;
  limits: Limits;
  exclude: string[];
  includeGenerated: boolean;
}

export class UsageError extends Error {}

const configKeys = ['base', 'maxLines', 'maxFiles', 'warnAt', 'exclude', 'includeGenerated'];

export const emptyConfig: Config = {
  base: undefined,
  maxLines: undefined,
  maxFiles: undefined,
  warnAt: undefined,
  exclude: undefined,
  includeGenerated: undefined,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toCount(value: unknown, name: string): number {
  const count = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new UsageError(
      `${name} must be a whole number, 0 or more. Got ${JSON.stringify(value)}.`
    );
  }
  return count;
}

export function toFraction(value: unknown, name: string): number {
  const fraction = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof fraction !== 'number' || !(fraction > 0 && fraction <= 1)) {
    throw new UsageError(
      `${name} must be a fraction above 0 and at most 1. Got ${JSON.stringify(value)}.`
    );
  }
  return fraction;
}

function toStrings(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new UsageError(`${name} must be a list of globs.`);
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
  const { base, maxLines, maxFiles, warnAt, exclude, includeGenerated } = value;
  if (base !== undefined && typeof base !== 'string') {
    throw new UsageError(`${source}: base must be a string.`);
  }
  if (includeGenerated !== undefined && typeof includeGenerated !== 'boolean') {
    throw new UsageError(`${source}: includeGenerated must be true or false.`);
  }
  return {
    base,
    maxLines: maxLines === undefined ? undefined : toCount(maxLines, `${source}: maxLines`),
    maxFiles: maxFiles === undefined ? undefined : toCount(maxFiles, `${source}: maxFiles`),
    warnAt: warnAt === undefined ? undefined : toFraction(warnAt, `${source}: warnAt`),
    exclude: exclude === undefined ? undefined : toStrings(exclude, `${source}: exclude`),
    includeGenerated,
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
  const configFile = join(root, '.pr-size.json');
  if (existsSync(configFile)) {
    return parseConfig(readJson(configFile), '.pr-size.json');
  }
  const packageFile = join(root, 'package.json');
  if (existsSync(packageFile)) {
    const manifest = readJson(packageFile);
    if (isRecord(manifest) && manifest['pr-size'] !== undefined) {
      return parseConfig(manifest['pr-size'], 'package.json "pr-size"');
    }
  }
  return emptyConfig;
}

export function resolveOptions(flags: Config, config: Config): Options {
  return {
    base: flags.base ?? config.base,
    limits: {
      maxLines: flags.maxLines ?? config.maxLines ?? defaultLimits.maxLines,
      maxFiles: flags.maxFiles ?? config.maxFiles ?? defaultLimits.maxFiles,
      warnAt: flags.warnAt ?? config.warnAt ?? defaultLimits.warnAt,
    },
    exclude: [...(config.exclude ?? []), ...(flags.exclude ?? [])],
    includeGenerated: flags.includeGenerated ?? config.includeGenerated ?? false,
  };
}
