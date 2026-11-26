export {
  defaultMaxBehind,
  emptyConfig,
  loadConfig,
  parseConfig,
  resolveOptions,
  UsageError,
} from './config.ts';
export type { Config, Options } from './config.ts';
export { GitError, remoteOf } from './git.ts';
export type { Ref } from './git.ts';
export { formatReport } from './report.ts';
export type { MergeBase, Report } from './report.ts';
export { exitCode, run } from './run.ts';
export type { Io } from './run.ts';
export {
  ageInDays,
  decideVerdict,
  findOverlap,
  parseCounts,
  parseMergeTree,
  parsePaths,
} from './staleness.ts';
export type { Counts, MergeCheck, MergeStatus, OverlapFile, Verdict } from './staleness.ts';
