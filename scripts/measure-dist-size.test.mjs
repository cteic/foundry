import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { measure, readBase, renderTable } from './measure-dist-size.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, 'measure-dist-size.mjs');

function buildDir(source) {
  const dir = mkdtempSync(join(tmpdir(), 'measure-'));
  mkdirSync(join(dir, 'one', 'dist', 'nested'), { recursive: true });
  mkdirSync(join(dir, 'no-build'), { recursive: true });
  writeFileSync(join(dir, 'one', 'dist', 'index.js'), source);
  writeFileSync(join(dir, 'one', 'dist', 'nested', 'more.js'), source);
  writeFileSync(join(dir, 'one', 'dist', 'index.d.ts'), source);
  return dir;
}

test('counts every .js file under each dist directory and nothing else', () => {
  const [one] = measure(buildDir('export const a = 1;\n'));
  const [empty] = measure(mkdtempSync(join(tmpdir(), 'measure-')));
  assert.equal(one.status, 'PASS');
  assert.ok(one.size > 0);
  assert.equal(empty.size, 0);
});

test('fails a build over the ceiling', () => {
  const big = Array.from({ length: 40000 }, () => Math.random().toString(36)).join('');
  const [row] = measure(buildDir(big));
  assert.equal(row.status, 'FAIL');
});

test('the table gains a base column only when a base is given', () => {
  const rows = [{ name: 'All package JS', size: 2048, budget: 4096, status: 'PASS' }];
  assert.doesNotMatch(renderTable(rows, null), /vs base/);
  assert.match(renderTable(rows, new Map([['All package JS', 1024]])), /\+1\.0 kB/);
  assert.match(renderTable(rows, new Map([['All package JS', 2048]])), /no change/);
  assert.match(renderTable(rows, new Map()), /new/);
});

test('CLI writes the JSON and Markdown files and reads its own JSON as a base', () => {
  const dir = buildDir('export const a = 1;\n');
  const json = join(dir, 'size.json');
  const markdown = join(dir, 'size.md');
  const first = spawnSync('node', [script, '--build-dir', dir, '--json', json]);
  assert.equal(first.status, 0);
  assert.equal(readBase(json).size, 1);
  const second = spawnSync('node', [
    script,
    '--build-dir',
    dir,
    '--base',
    json,
    '--markdown',
    markdown,
  ]);
  assert.equal(second.status, 0);
  assert.match(readFileSync(markdown, 'utf8'), /no change/);
});
