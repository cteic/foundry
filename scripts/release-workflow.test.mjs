import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(resolve(here, '../.github/workflows/release.yml'), 'utf8');

function job(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `job ${name} not found`);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

// changeset version formats the changelogs with Prettier, and the repo's Prettier config
// loads @cteic/prettier-config from dist, so the packages must be built first.
test('the version job builds the packages before changeset version runs', () => {
  const version = job('version');
  const build = version.indexOf('run: pnpm build');
  assert.notEqual(build, -1, 'version job has no pnpm build step');
  assert.ok(build < version.indexOf('changesets/action/version'));
});

// changeset version exits 1 when there is nothing to release, which failed every push to dev
// that followed a merged version PR.
function pendingCheck() {
  const version = job('version');
  const match = version.match(/id: pending\n\s+run: \|\n((?:\s{10}.*\n)+)/);
  assert.ok(match, 'version job has no pending changesets check');
  return match[1].replace(/^ {10}/gm, '');
}

function runPendingCheck(files) {
  const dir = mkdtempSync(join(tmpdir(), 'pending-'));
  mkdirSync(join(dir, '.changeset'));
  for (const file of files) writeFileSync(join(dir, '.changeset', file), '');
  const output = join(dir, 'output');
  writeFileSync(output, '');
  const result = spawnSync('bash', ['-e', '-c', pendingCheck()], {
    cwd: dir,
    env: { ...process.env, GITHUB_OUTPUT: output },
  });
  assert.equal(result.status, 0, String(result.stderr));
  return readFileSync(output, 'utf8').trim();
}

test('the pending check finds a changeset', () => {
  assert.equal(runPendingCheck(['config.json', 'brave-cats.md']), 'found=true');
});

test('the pending check finds nothing when only config and README remain', () => {
  assert.equal(runPendingCheck(['config.json', 'README.md']), 'found=false');
});

test('changeset version runs only when changesets are pending', () => {
  const version = job('version');
  const step = version.slice(
    version.lastIndexOf('- if:', version.indexOf('changesets/action/version'))
  );
  assert.match(step, /^- if: steps\.pending\.outputs\.found == 'true'\n/);
});

test('the changeset gate skips the dev to main release PR', () => {
  const ci = readFileSync(resolve(here, '../.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /!\(github\.head_ref == 'dev' && github\.base_ref == 'main'\)/);
});
