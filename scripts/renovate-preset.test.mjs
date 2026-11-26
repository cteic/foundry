import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const preset = JSON.parse(readFileSync(resolve(here, '../default.json'), 'utf8'));

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
function settle({ name, updateType, currentVersion }) {
  const result = {};
  for (const rule of preset.packageRules) {
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

test('a foundry patch on 0.x is grouped, unscheduled and merges on its own', () => {
  const result = settle({ name: '@cteic/tsconfig', updateType: 'patch', currentVersion: '0.1.0' });
  assert.equal(result.groupName, 'foundry');
  assert.deepEqual(result.schedule, ['at any time']);
  assert.equal(result.minimumReleaseAge, null);
  assert.equal(result.automerge, true);
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

test('a foundry minor from 1.0 merges on its own', () => {
  const result = settle({
    name: '@cteic/eslint-config',
    updateType: 'minor',
    currentVersion: '1.2.0',
  });
  assert.equal(result.automerge, true);
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
});
