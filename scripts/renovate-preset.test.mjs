import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

const preset = readJson('default.json');
const canary = readJson('canary.json');

function matchesName(patterns, name) {
  return patterns.some((pattern) =>
    pattern.endsWith('/**') ? name.startsWith(pattern.slice(0, -2)) : pattern === name
  );
}

function matchesVersion(matcher, version) {
  const negated = matcher.startsWith('!');
  const source = negated ? matcher.slice(1) : matcher;
  const regex = new RegExp(source.slice(1, -1));
  return negated !== regex.test(version);
}

// A small model of Renovate's packageRules: every matching rule applies in order, later rules win.
// An app that extends the canary preset after the default gets the canary rules last.
function settle({ name, updateType, currentVersion }, { isCanary = false } = {}) {
  const rules = isCanary ? [...preset.packageRules, ...canary.packageRules] : preset.packageRules;
  const result = {};
  for (const rule of rules) {
    if (rule.matchPackageNames && !matchesName(rule.matchPackageNames, name)) continue;
    if (rule.matchUpdateTypes && !rule.matchUpdateTypes.includes(updateType)) continue;
    if (rule.matchCurrentVersion && !matchesVersion(rule.matchCurrentVersion, currentVersion)) {
      continue;
    }
    if (rule.matchManagers) continue;
    Object.assign(result, rule);
  }
  return result;
}

const foundryMinor = { name: '@cteic/eslint-config', updateType: 'minor', currentVersion: '1.2.0' };

test('a foundry release is grouped, unscheduled and first in the queue', () => {
  const result = settle(foundryMinor);
  assert.equal(result.groupName, 'foundry');
  assert.deepEqual(result.schedule, ['at any time']);
  assert.equal(result.prPriority, 10);
});

test('an app waits 1 day for a foundry release', () => {
  assert.equal(settle(foundryMinor).minimumReleaseAge, '1 day');
});

test('the canary app takes a foundry release with no wait', () => {
  assert.equal(settle(foundryMinor, { isCanary: true }).minimumReleaseAge, null);
});

test('the canary preset changes nothing but the foundry wait', () => {
  for (const rule of canary.packageRules) {
    const { description, matchPackageNames, ...settings } = rule;
    assert.ok(description);
    assert.deepEqual(matchPackageNames, ['@cteic/**']);
    assert.deepEqual(Object.keys(settings), ['minimumReleaseAge']);
  }
});

test('a foundry minor from 1.0 merges on its own, and Renovate does the merge', () => {
  const result = settle(foundryMinor);
  assert.equal(result.automerge, true);
  assert.equal(result.platformAutomerge, false);
});

test('a foundry patch on 0.x merges on its own, and Renovate does the merge', () => {
  const result = settle({ name: '@cteic/tsconfig', updateType: 'patch', currentVersion: '0.1.0' });
  assert.equal(result.automerge, true);
  assert.equal(result.platformAutomerge, false);
});

test('every foundry rule that auto-merges leaves the merge to Renovate', () => {
  const merging = preset.packageRules.filter((rule) => rule.automerge === true);
  assert.ok(merging.length > 0);
  for (const rule of merging) {
    assert.equal(rule.platformAutomerge, false, rule.description);
  }
});

test('a foundry minor on 0.x waits for review', () => {
  const result = settle({
    name: '@cteic/eslint-config',
    updateType: 'minor',
    currentVersion: '0.3.0',
  });
  assert.equal(result.groupName, 'foundry');
  assert.notEqual(result.automerge, true);
});

test('a foundry major never merges on its own', () => {
  const result = settle({
    name: '@cteic/eslint-config',
    updateType: 'major',
    currentVersion: '1.2.0',
  });
  assert.notEqual(result.automerge, true);
  assert.deepEqual(result.addLabels, ['major']);
});

test('a React major moves react and its types together', () => {
  for (const name of ['react', 'react-dom', '@types/react', '@types/react-dom']) {
    assert.equal(
      settle({ name, updateType: 'major', currentVersion: '19.2.0' }).groupName,
      'react'
    );
  }
});

test('a Next.js major moves next and its companions together', () => {
  for (const name of ['next', 'eslint-config-next', '@next/bundle-analyzer']) {
    assert.equal(settle({ name, updateType: 'major', currentVersion: '16.0.0' }).groupName, 'next');
  }
});

test('other non-major updates stay in the weekly batch', () => {
  const result = settle({ name: 'zod', updateType: 'minor', currentVersion: '4.1.0' });
  assert.equal(result.groupName, 'non-major dependencies');
  assert.notEqual(result.automerge, true);
  assert.equal(result.minimumReleaseAge, undefined);
});

test('a package that has never been released ships its first version as 1.0.0', () => {
  const unreleased = new Set(
    readdirSync(resolve(root, 'packages'))
      .map((dir) => readJson(join('packages', dir, 'package.json')))
      .filter((pkg) => pkg.version === '0.0.0' && pkg.private !== true)
      .map((pkg) => pkg.name)
  );
  const changesetDir = resolve(root, '.changeset');
  for (const file of readdirSync(changesetDir).filter((name) => name.endsWith('.md'))) {
    const text = readFileSync(join(changesetDir, file), 'utf8');
    for (const [, name, bump] of text.matchAll(/^['"]([^'"]+)['"]:\s*(\w+)$/gm)) {
      if (unreleased.has(name)) {
        assert.equal(bump, 'major', `${file}: first release of ${name} must be major (1.0.0)`);
      }
    }
  }
});
