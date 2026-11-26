#!/usr/bin/env node
// Measures the built JavaScript of every package, gzipped. It exists so the
// self-test can run the Bundle size workflow against this repo, and it shows
// the contract a measure script must meet: see docs/measurement.md.
//
//   --build-dir  directory that holds the packages (default: packages)
//   --json       write the measurements to a file
//   --base       a --json file from the base commit; adds a "vs base" column
//   --markdown   write the table to a file
import console from 'node:console';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

// A ceiling for the self-test, not a tuned budget. The packages measured
// 25.5 kB on Node 24.16 with `pnpm build`, the same figure on five builds.
const CEILING = 100 * 1024;
const NAME = 'All package JS';

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

export function measure(buildDir) {
  let size = 0;
  for (const entry of readdirSync(buildDir, { withFileTypes: true })) {
    const dist = join(buildDir, entry.name, 'dist');
    if (!entry.isDirectory() || !existsSync(dist)) continue;
    for (const file of readdirSync(dist, { withFileTypes: true, recursive: true })) {
      if (!file.isFile() || !file.name.endsWith('.js')) continue;
      size += gzipSync(readFileSync(join(file.parentPath, file.name))).byteLength;
    }
  }
  return [{ name: NAME, size, budget: CEILING, status: size <= CEILING ? 'PASS' : 'FAIL' }];
}

function isMeasurement(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.name === 'string' &&
    typeof value.size === 'number'
  );
}

export function readBase(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${file} is not a list of measurements`);
  return new Map(parsed.filter(isMeasurement).map((row) => [row.name, row.size]));
}

function baseCell(baseSizes, row) {
  const base = baseSizes.get(row.name);
  if (base === undefined) return 'new';
  const diff = row.size - base;
  if (diff === 0) return 'no change';
  return `${diff > 0 ? '+' : '-'}${formatBytes(Math.abs(diff))}`;
}

export function renderTable(rows, baseSizes) {
  const lines = baseSizes
    ? ['| Measured | JS (gz) | vs base | Budget | Status |', '| --- | ---: | ---: | ---: | :---: |']
    : ['| Measured | JS (gz) | Budget | Status |', '| --- | ---: | ---: | :---: |'];
  for (const row of rows) {
    const base = baseSizes ? ` ${baseCell(baseSizes, row)} |` : '';
    lines.push(
      `| ${row.name} | ${formatBytes(row.size)} |${base} ${formatBytes(row.budget)} | ${row.status} |`
    );
  }
  return lines.join('\n');
}

function main() {
  const { values } = parseArgs({
    options: {
      'build-dir': { type: 'string', default: 'packages' },
      json: { type: 'string' },
      base: { type: 'string' },
      markdown: { type: 'string' },
    },
  });

  const rows = measure(resolve(values['build-dir']));
  const table = renderTable(rows, values.base ? readBase(values.base) : null);
  console.log(table);
  if (values.json) writeFileSync(values.json, `${JSON.stringify(rows, null, 2)}\n`);
  if (values.markdown) writeFileSync(values.markdown, `${table}\n`);

  if (rows.some((row) => row.status === 'FAIL')) {
    console.error('Over budget.');
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
