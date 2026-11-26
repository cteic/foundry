import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
