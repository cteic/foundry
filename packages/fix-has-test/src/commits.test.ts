import { describe, expect, it } from 'vitest';

import {
  classifyCommits,
  findWaiver,
  parseLog,
  parseSubject,
  type ClassifyRules,
  type Commit,
} from './commits.ts';

function commit(subject: string, overrides: Partial<Commit> = {}): Commit {
  return { hash: 'abc1234', parents: 1, subject, body: '', ...overrides };
}

function rules(overrides: Partial<ClassifyRules> = {}): ClassifyRules {
  return { types: ['fix'], exemptScopes: ['deps'], filesOf: () => [], ...overrides };
}

describe('parseLog', () => {
  it('reads the hash, the parent count, the subject and the body', () => {
    const output = [
      'aaa\x1fp1\x1ffix(web): stop the double submit\x1fBody line\n\nNo-test: none needed\n',
      'bbb\x1fp1 p2\x1fMerge branch dev\x1f',
      'ccc\x1f\x1fchore: initial commit\x1f',
    ].join('\0');

    expect(parseLog(`${output}\0`)).toEqual([
      {
        hash: 'aaa',
        parents: 1,
        subject: 'fix(web): stop the double submit',
        body: 'Body line\n\nNo-test: none needed',
      },
      { hash: 'bbb', parents: 2, subject: 'Merge branch dev', body: '' },
      { hash: 'ccc', parents: 0, subject: 'chore: initial commit', body: '' },
    ]);
  });
});

describe('parseSubject', () => {
  it.each([
    ['fix: stop the crash', { type: 'fix', scope: null, breaking: false }],
    ['fix(web): stop the crash', { type: 'fix', scope: 'web', breaking: false }],
    ['fix!: drop the old flag', { type: 'fix', scope: null, breaking: true }],
    ['fix(api)!: drop the old flag', { type: 'fix', scope: 'api', breaking: true }],
    ['Fix(Web): stop the crash', { type: 'fix', scope: 'Web', breaking: false }],
    ['feat(web): add export', { type: 'feat', scope: 'web', breaking: false }],
  ])('reads %j', (subject, expected) => {
    expect(parseSubject(subject)).toEqual(expected);
  });

  it.each(['fix the crash', 'fix:', 'fix:no space', 'fixed the crash', ''])(
    'returns undefined for %j',
    (subject) => {
      expect(parseSubject(subject)).toBeUndefined();
    }
  );
});

describe('findWaiver', () => {
  it('reads the reason, whatever the case of the key', () => {
    expect(findWaiver('Why it broke.\n\nNo-test: workflow file only')).toBe('workflow file only');
    expect(findWaiver('no-test:   typo in a log line  ')).toBe('typo in a log line');
  });

  it('returns an empty reason when the line gives none', () => {
    expect(findWaiver('No-test:')).toBe('');
  });

  it('ignores the words in the middle of a line', () => {
    expect(findWaiver('There is No-test: here')).toBeUndefined();
  });
});

describe('classifyCommits', () => {
  it('keeps fix commits and drops other types', () => {
    const { fixes, ignored } = classifyCommits(
      [
        commit('fix(web): stop the double submit'),
        commit('feat: add export'),
        commit('update things'),
        commit('fixup! fix(web): stop the double submit'),
      ],
      rules()
    );

    expect(ignored).toEqual([]);
    expect(fixes).toEqual([
      {
        hash: 'abc1234',
        subject: 'fix(web): stop the double submit',
        type: 'fix',
        scope: 'web',
        breaking: false,
        status: 'needs-test',
        note: '',
      },
    ]);
  });

  it('keeps a breaking fix', () => {
    expect(classifyCommits([commit('fix!: drop the old flag')], rules()).fixes).toMatchObject([
      { breaking: true, status: 'needs-test' },
    ]);
  });

  it('ignores merge commits and reverts, and says why', () => {
    const { fixes, ignored } = classifyCommits(
      [
        commit('fix: merged by hand', { parents: 2 }),
        commit('Revert "fix(web): stop the double submit"'),
        commit('revert: fix(web): stop the double submit'),
      ],
      rules()
    );

    expect(fixes).toEqual([]);
    expect(ignored.map((item) => item.reason)).toEqual(['merge', 'revert', 'revert']);
  });

  it('checks every type on the list', () => {
    const { fixes } = classifyCommits(
      [commit('perf: cache the query'), commit('fix: stop the crash')],
      rules({ types: ['fix', 'PERF'] })
    );

    expect(fixes.map((fix) => fix.type)).toEqual(['perf', 'fix']);
  });

  it('waives a commit with a No-test reason and keeps the reason', () => {
    const { fixes } = classifyCommits(
      [commit('fix(ci): pin the runner', { body: 'No-test: workflow file only' })],
      rules()
    );

    expect(fixes).toMatchObject([{ status: 'waived', note: 'workflow file only' }]);
  });

  it('does not waive a commit whose No-test line has no reason', () => {
    const { fixes } = classifyCommits([commit('fix: x y', { body: 'No-test:  ' })], rules());

    expect(fixes).toMatchObject([
      { status: 'needs-test', note: 'The No-test line gives no reason' },
    ]);
  });

  it('exempts a dependency fix that changes dependency files only', () => {
    const { fixes } = classifyCommits(
      [commit('fix(deps): update dependency zod to v4.1.2')],
      rules({ filesOf: () => ['package.json', 'apps/web/package.json', 'pnpm-lock.yaml'] })
    );

    expect(fixes).toMatchObject([{ status: 'exempt', note: 'scope deps, dependency files only' }]);
  });

  it('does not exempt a dependency fix that also changes source', () => {
    const { fixes } = classifyCommits(
      [commit('fix(deps): update zod and adapt the parser')],
      rules({ filesOf: () => ['package.json', 'src/parser.ts', 'src/schema.ts'] })
    );

    expect(fixes).toMatchObject([
      { status: 'needs-test', note: 'scope deps, but it also changes src/parser.ts and 1 more' },
    ]);
  });

  it('exempts no scope when the list is empty', () => {
    const { fixes } = classifyCommits(
      [commit('fix(deps): update dependency zod to v4.1.2')],
      rules({ exemptScopes: [], filesOf: () => ['package.json'] })
    );

    expect(fixes).toMatchObject([{ status: 'needs-test' }]);
  });
});
