import { firstMatch } from './glob.ts';

export interface FileChange {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
}

export interface CountedFile extends FileChange {
  lines: number;
}

export interface ExcludedFile {
  path: string;
  lines: number;
  reason: string;
}

export interface Limits {
  maxLines: number;
  maxFiles: number;
  warnAt: number;
}

export interface DirectoryGroup {
  directory: string;
  lines: number;
  files: number;
}

export interface ExcludeRules {
  exclude: readonly string[];
  includeGenerated: boolean;
  linguistGenerated: ReadonlySet<string>;
}

export interface Partition {
  counted: CountedFile[];
  excluded: ExcludedFile[];
}

export type Verdict = 'pass' | 'warn' | 'fail';

export const defaultLimits: Limits = { maxLines: 400, maxFiles: 25, warnAt: 0.8 };

export const generatedGlobs: readonly string[] = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'go.sum',
  '*.lock',
  '*.lockb',
  '*.snap',
  '**/__snapshots__/**',
  '**/dist/**',
  '**/vendor/**',
  '**/node_modules/**',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.webp',
  '*.avif',
  '*.ico',
  '*.svg',
];

const dominantShare = 0.9;
const numstatRecord = /^(-|\d+)\t(-|\d+)\t(.*)$/s;

export function parseNumstat(output: string): FileChange[] {
  const tokens = output.split('\0');
  const changes: FileChange[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] ?? '';
    index += 1;
    if (token === '') {
      continue;
    }
    const match = numstatRecord.exec(token);
    if (match === null) {
      throw new Error(`Cannot parse numstat record: ${JSON.stringify(token)}`);
    }
    const [, added = '', deleted = '', inlinePath = ''] = match;
    let path = inlinePath;
    if (path === '') {
      path = tokens[index + 1] ?? '';
      index += 2;
    }
    const binary = added === '-' || deleted === '-';
    changes.push({
      path,
      added: binary ? 0 : Number(added),
      deleted: binary ? 0 : Number(deleted),
      binary,
    });
  }
  return changes;
}

function excludeReason(path: string, rules: ExcludeRules): string | undefined {
  const excluded = firstMatch(path, rules.exclude);
  if (excluded !== undefined) {
    return `exclude: ${excluded}`;
  }
  if (rules.includeGenerated) {
    return undefined;
  }
  if (rules.linguistGenerated.has(path)) {
    return 'linguist-generated';
  }
  const generated = firstMatch(path, generatedGlobs);
  return generated === undefined ? undefined : `generated: ${generated}`;
}

function byLinesThenName<T extends { lines: number }>(name: (item: T) => string) {
  return (a: T, b: T): number => b.lines - a.lines || name(a).localeCompare(name(b));
}

export function partitionChanges(changes: readonly FileChange[], rules: ExcludeRules): Partition {
  const counted: CountedFile[] = [];
  const excluded: ExcludedFile[] = [];
  for (const change of changes) {
    const lines = change.added + change.deleted;
    const reason = excludeReason(change.path, rules);
    if (reason === undefined) {
      counted.push({ ...change, lines });
    } else {
      excluded.push({ path: change.path, lines, reason });
    }
  }
  counted.sort(byLinesThenName((file) => file.path));
  excluded.sort(byLinesThenName((file) => file.path));
  return { counted, excluded };
}

export function sumLines(files: readonly { lines: number }[]): number {
  return files.reduce((total, file) => total + file.lines, 0);
}

export function decideVerdict(lines: number, files: number, limits: Limits): Verdict {
  if (lines > limits.maxLines || files > limits.maxFiles) {
    return 'fail';
  }
  if (lines >= limits.maxLines * limits.warnAt || files >= limits.maxFiles * limits.warnAt) {
    return 'warn';
  }
  return 'pass';
}

function directorySegments(path: string): string[] {
  return path.split('/').slice(0, -1);
}

export function groupByDirectory(files: readonly CountedFile[]): DirectoryGroup[] {
  const deepest = Math.max(0, ...files.map((file) => directorySegments(file.path).length));
  let groups = new Map<string, DirectoryGroup>();
  for (let depth = 1; depth <= Math.max(1, deepest); depth += 1) {
    groups = new Map();
    for (const file of files) {
      const directory = directorySegments(file.path).slice(0, depth).join('/') || '.';
      const group = groups.get(directory) ?? { directory, lines: 0, files: 0 };
      group.lines += file.lines;
      group.files += 1;
      groups.set(directory, group);
    }
    const largest = Math.max(...[...groups.values()].map((group) => group.lines));
    if (groups.size > 1 && largest <= sumLines(files) * dominantShare) {
      break;
    }
  }
  return [...groups.values()].sort(byLinesThenName((group) => group.directory));
}
