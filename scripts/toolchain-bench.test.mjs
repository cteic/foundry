import assert from 'node:assert/strict';
import test from 'node:test';

import {
  change,
  median,
  parseArgs,
  renderReport,
  summarise,
  toolVersions,
  withinNoise,
} from './toolchain-bench-lib.mjs';

function run(overrides = {}) {
  return {
    app: 'tonnta',
    label: 'baseline',
    date: '2026-11-27',
    commit: '3e9cdf22ed2d8db1931a0b774c3a33467a07ade8',
    machine: { chip: 'Apple M2 Max', cpus: 12 },
    tools: { typescript: ['5.7.3'] },
    code: { files: 120, lines: 9000 },
    steps: {
      lint: { median: 40, min: 39, max: 42, runs: 5, failed: false },
      typecheck: { median: 20, min: 19, max: 21, runs: 5, failed: false },
    },
    ...overrides,
  };
}

test('the median of an even count is the mean of the middle two', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([5, 1, 3]), 3);
});

test('a hyperfine 2 result is summarised from its measurements', () => {
  const result = {
    measurements: [
      { time_wall_clock: { value: 2.0004 }, exit_code: 0 },
      { time_wall_clock: { value: 1.5 }, exit_code: 0 },
      { time_wall_clock: { value: 3 }, exit_code: 0 },
    ],
  };
  assert.deepEqual(summarise(result), { median: 2, min: 1.5, max: 3, runs: 3, failed: false });
});

test('a step that exits non-zero in any run is marked failed', () => {
  const result = { times: [1, 1, 1], exit_codes: [0, 2, 0] };
  assert.equal(summarise(result).failed, true);
});

test('tool versions are collected across workspace projects without repeats', () => {
  const list = [
    { devDependencies: { typescript: { version: '5.7.3' }, eslint: { version: '9.17.0' } } },
    {
      dependencies: { next: { version: '16.1.0' } },
      devDependencies: { typescript: { version: '5.7.3' } },
    },
    { devDependencies: { typescript: { version: '5.8.0' }, 'left-pad': { version: '1.0.0' } } },
  ];
  assert.deepEqual(toolVersions(list), {
    eslint: ['9.17.0'],
    next: ['16.1.0'],
    typescript: ['5.7.3', '5.8.0'],
  });
});

test('a negative change is faster', () => {
  assert.deepEqual(change(40, 10), { seconds: -30, percent: -75 });
});

test('the report compares the baseline with the latest run on the same machine', () => {
  const after = run({
    label: 'ts7',
    date: '2026-12-10',
    steps: {
      lint: { median: 10, min: 9, max: 11, runs: 5, failed: false },
      typecheck: { median: 2, min: 2, max: 2, runs: 5, failed: false },
    },
  });
  const report = renderReport([after, run()]);
  assert.match(
    report,
    /\| `lint` \| 40\.0 s \| 39\.0-42\.0 s \| 10\.0 s \| 9\.0-11\.0 s \| -30\.0 s \(-75%\) \|/
  );
  assert.match(
    report,
    /\| `typecheck` \| 20\.0 s \| 19\.0-21\.0 s \| 2\.0 s \| 2\.0-2\.0 s \| -18\.0 s \(-90%\) \|/
  );
});

test('runs from different machines are never compared', () => {
  const other = run({ label: 'ts7', date: '2026-12-10', machine: { chip: 'AMD EPYC', cpus: 4 } });
  const report = renderReport([run(), other]);
  assert.match(report, /different machine, so it is not compared/);
  assert.doesNotMatch(report, /Change/);
});

test('a failed step shows no change', () => {
  const after = run({
    label: 'ts7',
    date: '2026-12-10',
    steps: { lint: { median: 5, min: 5, max: 5, runs: 5, failed: true } },
  });
  const report = renderReport([run(), after]);
  assert.match(
    report,
    /\| `lint` \| 40\.0 s \| 39\.0-42\.0 s \| 5\.0 s \(failed\) \| 5\.0-5\.0 s \| {2}\|/
  );
});

test('arguments are checked before anything runs', () => {
  assert.throws(
    () => parseArgs(['--repo', '.', '--app', 'Tonnta', '--label', 'baseline']),
    /kebab-case/
  );
  assert.throws(
    () => parseArgs(['--repo', '.', '--app', 'tonnta', '--label', 'x', '--runs', '1']),
    /3 to 20/
  );
  assert.throws(
    () => parseArgs(['--repo', '.', '--app', 'tonnta', '--label', 'x', '--steps', 'deploy']),
    /unknown steps/
  );
  assert.deepEqual(
    parseArgs(['--repo', '.', '--app', 'tonnta', '--label', 'ts7', '--steps', 'lint,typecheck'])
      .steps,
    ['lint', 'typecheck']
  );
});

test('a change smaller than either range is marked within noise', () => {
  const before = { median: 8.2, min: 4.1, max: 10.6, runs: 5, failed: false };
  const after = { median: 6.0, min: 5.8, max: 6.3, runs: 5, failed: false };
  assert.equal(withinNoise(before, after), true);
  const report = renderReport([
    run({ steps: { typecheck: before } }),
    run({ label: 'ts7', date: '2026-12-10', steps: { typecheck: after } }),
  ]);
  assert.match(report, /-2\.2 s \(-27%\), within noise \|/);
});

test('a change larger than both ranges is a result', () => {
  const before = { median: 20, min: 19, max: 21, runs: 5, failed: false };
  const after = { median: 2, min: 2, max: 2.5, runs: 5, failed: false };
  assert.equal(withinNoise(before, after), false);
});
