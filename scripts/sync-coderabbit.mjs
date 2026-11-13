#!/usr/bin/env node
import console from 'node:console';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const BEGIN = '# BEGIN repo-specific';
const END = '# END repo-specific';

function normalise(text) {
  return text.replace(/\r\n/g, '\n').trimEnd() + '\n';
}

function findMarkers(lines) {
  const begin = lines.findIndex((line) => line.trim().startsWith(BEGIN));
  const end = lines.findIndex((line, index) => index > begin && line.trim().startsWith(END));
  if (begin === -1 || end === -1) return null;
  return { begin, end };
}

export function extractRegion(text) {
  const lines = normalise(text).split('\n');
  const markers = findMarkers(lines);
  if (!markers) return null;
  return lines.slice(markers.begin + 1, markers.end);
}

export function sync(baseText, repoText) {
  const baseLines = normalise(baseText).split('\n');
  const markers = findMarkers(baseLines);
  if (!markers) throw new Error(`base has no "${BEGIN}" and "${END}" markers`);
  const region = repoText === null ? [] : extractRegion(repoText);
  const preserved = region ?? [];
  const lines = [
    ...baseLines.slice(0, markers.begin + 1),
    ...preserved,
    ...baseLines.slice(markers.end),
  ];
  return {
    text: lines.join('\n'),
    keptRegion: region !== null,
    keptLines: preserved.length,
  };
}

function main() {
  const target = resolve(process.argv[2] ?? '.coderabbit.yaml');
  const here = dirname(fileURLToPath(import.meta.url));
  const basePath = resolve(process.argv[3] ?? resolve(here, '../coderabbit/base.yaml'));
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  const result = sync(readFileSync(basePath, 'utf8'), current);
  if (current !== null && normalise(current) === result.text) {
    console.log(`unchanged: ${target} already matches the base`);
    return;
  }
  writeFileSync(target, result.text);
  if (current === null) {
    console.log(`created: ${target} from the base`);
  } else if (result.keptRegion) {
    console.log(`updated: ${target} from the base, kept ${result.keptLines} repo-specific lines`);
  } else {
    console.log(
      `replaced: ${target} had no repo-specific markers, review the diff for rules to move inside them`
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
