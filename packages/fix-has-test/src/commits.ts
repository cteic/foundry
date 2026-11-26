import { firstMatch } from './glob.ts';

export interface Commit {
  hash: string;
  parents: number;
  subject: string;
  body: string;
}

export interface Subject {
  type: string;
  scope: string | null;
  breaking: boolean;
}

export type FixStatus = 'needs-test' | 'waived' | 'exempt';

export interface FixCommit {
  hash: string;
  subject: string;
  type: string;
  scope: string | null;
  breaking: boolean;
  status: FixStatus;
  note: string;
}

export type IgnoreReason = 'merge' | 'revert';

export interface IgnoredCommit {
  hash: string;
  subject: string;
  reason: IgnoreReason;
}

export interface Classified {
  fixes: FixCommit[];
  ignored: IgnoredCommit[];
}

export interface ClassifyRules {
  types: readonly string[];
  exemptScopes: readonly string[];
  filesOf: (hash: string) => readonly string[];
}

export const dependencyFiles: readonly string[] = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.sum',
  'pyproject.toml',
  'requirements*.txt',
  'uv.lock',
  'poetry.lock',
  'Gemfile',
  'Gemfile.lock',
];

const fieldSeparator = '\x1f';
const conventional = /^([A-Za-z][\w-]*)(?:\(([^()]*)\))?(!)?:\s+\S/;
const gitRevert = 'Revert "';
const waiverLine = /^no-test:[ \t]*(.*)$/im;

export function parseLog(output: string): Commit[] {
  return output
    .split('\0')
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [hash = '', parents = '', subject = '', ...body] = record.split(fieldSeparator);
      return {
        hash: hash.trim(),
        parents: parents.trim() === '' ? 0 : parents.trim().split(' ').length,
        subject,
        body: body.join(fieldSeparator).trim(),
      };
    });
}

export function parseSubject(subject: string): Subject | undefined {
  const match = conventional.exec(subject);
  if (match === null) {
    return undefined;
  }
  const [, type = '', scope, bang] = match;
  return { type: type.toLowerCase(), scope: scope ?? null, breaking: bang === '!' };
}

export function findWaiver(body: string): string | undefined {
  const match = waiverLine.exec(body);
  return match === null ? undefined : (match[1] ?? '').trim();
}

function fixState(
  commit: Commit,
  scope: string | null,
  rules: ClassifyRules
): Pick<FixCommit, 'status' | 'note'> {
  const waiver = findWaiver(commit.body);
  if (waiver !== undefined && waiver !== '') {
    return { status: 'waived', note: waiver };
  }
  const noReason = waiver === undefined ? '' : 'The No-test line gives no reason';
  if (scope === null || !rules.exemptScopes.includes(scope)) {
    return { status: 'needs-test', note: noReason };
  }
  const other = rules
    .filesOf(commit.hash)
    .filter((path) => firstMatch(path, dependencyFiles) === undefined);
  if (other.length === 0) {
    return { status: 'exempt', note: `scope ${scope}, dependency files only` };
  }
  const first = other[0] ?? '';
  const rest = other.length > 1 ? ` and ${String(other.length - 1)} more` : '';
  return {
    status: 'needs-test',
    note: `scope ${scope}, but it also changes ${first}${rest}`,
  };
}

export function classifyCommits(commits: readonly Commit[], rules: ClassifyRules): Classified {
  const types = rules.types.map((type) => type.toLowerCase());
  const fixes: FixCommit[] = [];
  const ignored: IgnoredCommit[] = [];
  for (const commit of commits) {
    const { hash, subject } = commit;
    const parsed = parseSubject(subject);
    if (commit.parents > 1) {
      ignored.push({ hash, subject, reason: 'merge' });
    } else if (subject.startsWith(gitRevert) || parsed?.type === 'revert') {
      ignored.push({ hash, subject, reason: 'revert' });
    } else if (parsed !== undefined && types.includes(parsed.type)) {
      fixes.push({ hash, subject, ...parsed, ...fixState(commit, parsed.scope, rules) });
    }
  }
  return { fixes, ignored };
}
