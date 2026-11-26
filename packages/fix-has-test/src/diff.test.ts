import { describe, expect, it } from 'vitest';

import { parseAddedLines } from './diff.ts';

const diff = [
  'diff --git a/docs/a.md b/docs/a.md',
  'index 1111111..2222222 100644',
  '--- a/docs/a.md',
  '+++ b/docs/a.md',
  '@@ -2 +2,2 @@',
  '-old line',
  '+new line',
  '+second new line',
  '@@ -10,0 +12 @@ heading',
  '+++ b/not-a-header.md',
  'diff --git a/gone.ts b/gone.ts',
  'deleted file mode 100644',
  '--- a/gone.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-one',
  '--- a/still-a-removed-line',
  'diff --git a/logo.png b/logo.png',
  'Binary files a/logo.png and b/logo.png differ',
  'diff --git a/new.txt b/new.txt',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/new.txt',
  '@@ -0,0 +1 @@',
  '+only line',
  '\\ No newline at end of file',
  'diff --git "a/odd \\"name\\".md" "b/odd \\"name\\".md"',
  '--- "a/odd \\"name\\".md"',
  '+++ "b/odd \\"name\\".md"',
  '@@ -0,0 +5 @@',
  '+quoted path',
  '',
].join('\n');

describe('parseAddedLines', () => {
  it('returns each added line with its file and line number', () => {
    expect(parseAddedLines(diff)).toEqual([
      { path: 'docs/a.md', line: 2, text: 'new line' },
      { path: 'docs/a.md', line: 3, text: 'second new line' },
      { path: 'docs/a.md', line: 12, text: '++ b/not-a-header.md' },
      { path: 'new.txt', line: 1, text: 'only line' },
      { path: 'odd "name".md', line: 5, text: 'quoted path' },
    ]);
  });

  it('returns nothing for an empty diff', () => {
    expect(parseAddedLines('')).toEqual([]);
  });
});
