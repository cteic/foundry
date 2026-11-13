import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { check } from './check-coderabbit-drift.mjs';
import { sync } from './sync-coderabbit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const basePath = resolve(here, '../coderabbit/base.yaml');
const base = readFileSync(basePath, 'utf8');
const script = resolve(here, 'sync-coderabbit.mjs');

const extra = `    - path: '**/*.sh'
      instructions: >-
        Flag unquoted variable expansions.
`;

function withExtra(text) {
  return text.replace('    # END repo-specific', `${extra}    # END repo-specific`);
}

test('a missing file becomes the base', () => {
  const result = sync(base, null);
  assert.equal(result.text, base);
  assert.equal(check(base, result.text).ok, true);
});

test('an outdated copy is updated and keeps its repo-specific rules', () => {
  const outdated = withExtra(base).replace('  poem: false', '  poem: true');
  const result = sync(base, outdated);
  assert.equal(result.keptRegion, true);
  assert.equal(result.keptLines, 3);
  assert.match(result.text, /Flag unquoted variable expansions/);
  assert.match(result.text, / {2}poem: false/);
  assert.equal(check(base, result.text).ok, true);
});

test('a copy without markers is replaced and reported', () => {
  const legacy = base.replace(/^ *# (BEGIN|END) repo-specific.*\n/gm, '');
  const result = sync(base, legacy);
  assert.equal(result.keptRegion, false);
  assert.equal(result.text, base);
});

test('syncing twice gives the same file', () => {
  const once = sync(base, withExtra(base)).text;
  assert.equal(sync(base, once).text, once);
});

test('CLI writes the synced file and leaves a current one unchanged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-'));
  const target = join(dir, '.coderabbit.yaml');
  writeFileSync(target, withExtra(base).replace('[dev, main]', '[main]'));
  const first = spawnSync('node', [script, target, basePath], { encoding: 'utf8' });
  assert.equal(first.status, 0);
  assert.match(first.stdout, /updated: .*kept 3 repo-specific lines/);
  assert.equal(check(base, readFileSync(target, 'utf8')).ok, true);
  const second = spawnSync('node', [script, target, basePath], { encoding: 'utf8' });
  assert.match(second.stdout, /unchanged/);
});
