#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BEGIN = "# BEGIN repo-specific";
const END = "# END repo-specific";

function normalise(text) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trimEnd() + "\n";
}

export function stripRegion(text) {
  const lines = normalise(text).split("\n");
  const out = [];
  let inside = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(BEGIN)) {
      inside = true;
      continue;
    }
    if (trimmed.startsWith(END)) {
      inside = false;
      continue;
    }
    if (!inside) out.push(line);
  }
  if (inside) throw new Error(`"${BEGIN}" has no matching "${END}"`);
  return out.join("\n");
}

export function firstDifference(base, repo) {
  const a = base.split("\n");
  const b = repo.split("\n");
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) {
      return { line: i + 1, expected: a[i] ?? "(end of file)", actual: b[i] ?? "(end of file)" };
    }
  }
  return null;
}

export function check(baseText, repoText) {
  if (!repoText.includes(BEGIN) || !repoText.includes(END)) {
    return { ok: false, message: `missing "${BEGIN}" and "${END}" markers` };
  }
  const diff = firstDifference(stripRegion(baseText), stripRegion(repoText));
  if (diff) {
    return {
      ok: false,
      message: `drift at line ${diff.line} outside the repo-specific region\n  expected: ${diff.expected}\n  actual:   ${diff.actual}`,
    };
  }
  return { ok: true, message: "matches base" };
}

function main() {
  const target = process.argv[2] ?? ".coderabbit.yaml";
  const here = dirname(fileURLToPath(import.meta.url));
  const basePath = resolve(process.argv[3] ?? resolve(here, "../coderabbit/base.yaml"));
  const result = check(readFileSync(basePath, "utf8"), readFileSync(target, "utf8"));
  if (result.ok) {
    console.log(`ok: ${target} ${result.message}`);
    return;
  }
  console.error(`drift: ${target}: ${result.message}`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
