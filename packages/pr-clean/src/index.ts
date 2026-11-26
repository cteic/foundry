export {
  defaultEmDashFiles,
  emptyConfig,
  loadConfig,
  parseConfig,
  resolveOptions,
  UsageError,
} from './config.ts';
export type { Config, Options } from './config.ts';
export { parseAddedLines } from './diff.ts';
export type { AddedLine } from './diff.ts';
export { GitError, parseLog } from './git.ts';
export type { Base } from './git.ts';
export { globToRegExp } from './glob.ts';
export { allowMarker, creditPatterns, toolNames } from './patterns.ts';
export type { CreditPattern, Scope } from './patterns.ts';
export { formatReport } from './report.ts';
export type { Report, RuleResult, RuleStatus } from './report.ts';
export {
  checkAttribution,
  checkAuthors,
  checkEmDash,
  checkTrailers,
  dropIgnored,
  ruleNames,
} from './rules.ts';
export type { Commit, Finding, Location, RuleName } from './rules.ts';
export { exitCode, run } from './run.ts';
export type { Io } from './run.ts';
