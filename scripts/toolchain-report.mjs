#!/usr/bin/env node
// Renders benchmarks/README.md from every result in benchmarks/results.
//
//   node scripts/toolchain-report.mjs          writes the report
//   node scripts/toolchain-report.mjs --check  fails if the report is out of date
import console from 'node:console';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { renderReport } from './toolchain-bench-lib.mjs';

const benchmarks = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks');
const results = join(benchmarks, 'results');
const reportPath = join(benchmarks, 'README.md');

const runs = existsSync(results)
  ? readdirSync(results).flatMap((app) =>
      readdirSync(join(results, app))
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(readFileSync(join(results, app, file), 'utf8')))
    )
  : [];

const report = renderReport(runs);

if (process.argv.includes('--check')) {
  const current = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : '';
  if (current !== report) {
    console.error('benchmarks/README.md is out of date: run node scripts/toolchain-report.mjs');
    process.exit(1);
  }
  console.log('ok: benchmarks/README.md matches the results');
} else {
  writeFileSync(reportPath, report);
  console.log(`Wrote ${reportPath}`);
}
