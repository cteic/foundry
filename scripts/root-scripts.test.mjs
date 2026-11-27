import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// A merge conflict in package.json once dropped the bench scripts while the
// docs still told people to run them. These tests catch that.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function docs() {
  const files = ['README.md', ...readdirSync(join(root, 'docs')).map((file) => join('docs', file))];
  return files
    .filter((file) => file.endsWith('.md'))
    .map((file) => ({ file, text: readFileSync(join(root, file), 'utf8') }));
}

test('every pnpm bench command in the docs is a root script', () => {
  const named = new Set();
  for (const { file, text } of docs()) {
    for (const [, script] of text.matchAll(/pnpm (bench:[a-z-]+)/g)) {
      named.add(script);
      assert.ok(
        script in scripts,
        `${file} runs pnpm ${script}, but package.json has no such script`
      );
    }
  }
  assert.ok(named.size > 0, 'the docs name no bench command, so this test checks nothing');
});

test('pnpm test fails when the benchmark report is out of date', () => {
  assert.match(scripts.test, /node scripts\/toolchain-report\.mjs --check/);
});

test('pnpm test still runs the install policy check', () => {
  assert.match(scripts.test, /node packages\/install-policy\/dist\/cli\.js/);
});
