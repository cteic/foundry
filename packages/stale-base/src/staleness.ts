export type Verdict = 'pass' | 'warn' | 'fail';

export type MergeStatus = 'clean' | 'conflict' | 'unknown';

export interface Counts {
  behind: number;
  ahead: number;
}

export interface MergeCheck {
  status: MergeStatus;
  conflicts: string[];
}

export interface OverlapFile {
  path: string;
  conflict: boolean;
}

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function parseCounts(output: string): Counts {
  const match = /^(\d+)\s+(\d+)\s*$/.exec(output);
  if (match === null) {
    throw new Error(`Cannot parse the commit counts: ${JSON.stringify(output)}`);
  }
  return { behind: Number(match[1]), ahead: Number(match[2]) };
}

export function parsePaths(output: string): string[] {
  return output.split('\0').filter((path) => path !== '');
}

export function parseMergeTree(status: number | null, output: string): MergeCheck {
  if (status === 0) {
    return { status: 'clean', conflicts: [] };
  }
  if (status === 1) {
    const conflicts = [...new Set(parsePaths(output).slice(1))].sort();
    return { status: 'conflict', conflicts };
  }
  return { status: 'unknown', conflicts: [] };
}

export function findOverlap(
  changedOnBase: readonly string[],
  changedOnBranch: readonly string[],
  conflicts: readonly string[]
): OverlapFile[] {
  const onBranch = new Set(changedOnBranch);
  const conflicted = new Set(conflicts);
  const paths = new Set([...changedOnBase.filter((path) => onBranch.has(path)), ...conflicts]);
  return [...paths].sort().map((path) => ({ path, conflict: conflicted.has(path) }));
}

export function ageInDays(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / millisecondsPerDay));
}

export function decideVerdict(
  behind: number,
  maxBehind: number,
  merge: MergeStatus,
  overlapping: number
): Verdict {
  if (behind > maxBehind || merge === 'conflict') {
    return 'fail';
  }
  if (behind > 0 && overlapping > 0) {
    return 'warn';
  }
  return 'pass';
}
