import type { AddedLine } from './diff.ts';
import { firstMatch } from './glob.ts';
import { allowMarker, creditPatterns, emDash, type Scope } from './patterns.ts';

export const ruleNames = ['author', 'trailers', 'attribution', 'em-dash'] as const;

export type RuleName = (typeof ruleNames)[number];

export interface Commit {
  hash: string;
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  message: string;
}

export type Location =
  | { kind: 'commit'; commit: string }
  | { kind: 'file'; path: string; line: number }
  | { kind: 'pr-body'; line: number };

export interface Finding {
  rule: RuleName;
  check: string;
  location: Location;
  message: string;
  excerpt: string;
}

const excerptLength = 90;

export function isRuleName(value: string): value is RuleName {
  return ruleNames.some((name) => name === value);
}

function excerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > excerptLength ? `${trimmed.slice(0, excerptLength - 3)}...` : trimmed;
}

function bodyLines(body: string): { line: number; text: string }[] {
  return body.split('\n').map((text, index) => ({ line: index + 1, text }));
}

function creditHits(text: string, scope: Scope): { id: string; description: string }[] {
  return creditPatterns.filter(
    (pattern) => pattern.scopes.includes(scope) && pattern.regex.test(text)
  );
}

export function dropIgnored(lines: readonly AddedLine[], ignore: readonly string[]): AddedLine[] {
  return lines.filter(
    (added) => firstMatch(added.path, ignore) === undefined && !added.text.includes(allowMarker)
  );
}

export function checkAuthors(commits: readonly Commit[], allowed: readonly string[]): Finding[] {
  const allowedSet = new Set(allowed.map((identity) => identity.trim()));
  return commits.flatMap((commit) => {
    const identities = [
      { check: 'author', identity: `${commit.authorName} <${commit.authorEmail}>` },
      { check: 'committer', identity: `${commit.committerName} <${commit.committerEmail}>` },
    ];
    return identities
      .filter(({ identity }) => !allowedSet.has(identity))
      .map(({ check, identity }) => ({
        rule: 'author' as const,
        check,
        location: { kind: 'commit' as const, commit: commit.hash },
        message: `The ${check} is not on the allowed list`,
        excerpt: identity,
      }));
  });
}

export function checkTrailers(commits: readonly Commit[]): Finding[] {
  return commits.flatMap((commit) =>
    commit.message.split('\n').flatMap((text) =>
      creditHits(text, 'message').map((pattern) => ({
        rule: 'trailers' as const,
        check: pattern.id,
        location: { kind: 'commit' as const, commit: commit.hash },
        message: `Commit message: ${pattern.description}`,
        excerpt: excerpt(text),
      }))
    )
  );
}

export function checkAttribution(
  lines: readonly AddedLine[],
  prBody: string | undefined
): Finding[] {
  const inDiff = lines.flatMap((added) =>
    creditHits(added.text, 'diff').map((pattern) => ({
      rule: 'attribution' as const,
      check: pattern.id,
      location: { kind: 'file' as const, path: added.path, line: added.line },
      message: pattern.description,
      excerpt: excerpt(added.text),
    }))
  );
  const inBody = bodyLines(prBody ?? '').flatMap(({ line, text }) =>
    creditHits(text, 'body').map((pattern) => ({
      rule: 'attribution' as const,
      check: pattern.id,
      location: { kind: 'pr-body' as const, line },
      message: pattern.description,
      excerpt: excerpt(text),
    }))
  );
  return [...inDiff, ...inBody];
}

export function checkEmDash(
  commits: readonly Commit[],
  lines: readonly AddedLine[],
  prBody: string | undefined,
  proseGlobs: readonly string[]
): Finding[] {
  const finding = (location: Location, text: string, message: string): Finding => ({
    rule: 'em-dash',
    check: 'em-dash',
    location,
    message,
    excerpt: excerpt(text),
  });
  const inMessages = commits.flatMap((commit) =>
    commit.message
      .split('\n')
      .filter((text) => text.includes(emDash))
      .map((text) =>
        finding({ kind: 'commit', commit: commit.hash }, text, 'Commit message has an em dash')
      )
  );
  const inProse = lines
    .filter((added) => added.text.includes(emDash))
    .filter((added) => firstMatch(added.path, proseGlobs) !== undefined)
    .map((added) =>
      finding(
        { kind: 'file', path: added.path, line: added.line },
        added.text,
        'Added line has an em dash'
      )
    );
  const inBody = bodyLines(prBody ?? '')
    .filter(({ text }) => text.includes(emDash))
    .map(({ line, text }) => finding({ kind: 'pr-body', line }, text, 'PR body has an em dash'));
  return [...inMessages, ...inProse, ...inBody];
}
