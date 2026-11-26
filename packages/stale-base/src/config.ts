import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Config {
  base: string | undefined;
  maxBehind: number | undefined;
  fetch: boolean | undefined;
}

export interface Options {
  base: string | undefined;
  maxBehind: number;
  fetch: boolean;
}

export class UsageError extends Error {}

export const defaultMaxBehind = 0;

export const emptyConfig: Config = {
  base: undefined,
  maxBehind: undefined,
  fetch: undefined,
};

const configKeys = Object.keys(emptyConfig);

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
  const { base, maxBehind, fetch } = value;
  if (base !== undefined && typeof base !== 'string') {
    throw new UsageError(`${source}: base must be a string.`);
  }
  if (fetch !== undefined && typeof fetch !== 'boolean') {
    throw new UsageError(`${source}: fetch must be true or false.`);
  }
  return {
    base,
    maxBehind: maxBehind === undefined ? undefined : toCount(maxBehind, `${source}: maxBehind`),
    fetch,
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
  const configFile = join(root, '.stale-base.json');
  if (existsSync(configFile)) {
    return parseConfig(readJson(configFile), '.stale-base.json');
  }
  const packageFile = join(root, 'package.json');
  if (existsSync(packageFile)) {
    const manifest = readJson(packageFile);
    if (isRecord(manifest) && manifest['stale-base'] !== undefined) {
      return parseConfig(manifest['stale-base'], 'package.json "stale-base"');
    }
  }
  return emptyConfig;
}

export function resolveOptions(flags: Config, config: Config): Options {
  return {
    base: flags.base ?? config.base,
    maxBehind: flags.maxBehind ?? config.maxBehind ?? defaultMaxBehind,
    fetch: flags.fetch ?? config.fetch ?? false,
  };
}
