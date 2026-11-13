import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { check } from "./check-coderabbit-drift.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const basePath = resolve(here, "../coderabbit/base.yaml");
const base = readFileSync(basePath, "utf8");
const script = resolve(here, "check-coderabbit-drift.mjs");

const extra = `    - path: '**/*.sh'
      instructions: >-
        Flag unquoted variable expansions.
`;

function withExtra(text) {
  return text.replace("    # END repo-specific", `${extra}    # END repo-specific`);
}

test("identical copy passes", () => {
  assert.equal(check(base, base).ok, true);
});

test("additions inside the marked region pass", () => {
  assert.equal(check(base, withExtra(base)).ok, true);
});

test("a changed base branch fails", () => {
  const drifted = base.replace("base_branches: [dev, main]", "base_branches: [main]");
  const result = check(base, drifted);
  assert.equal(result.ok, false);
  assert.match(result.message, /base_branches/);
});

test("an addition outside the marked region fails", () => {
  const drifted = base.replace("  poem: false", "  poem: true");
  assert.equal(check(base, drifted).ok, false);
});

test("a copy without markers fails", () => {
  const stripped = base.replace(/^ *# (BEGIN|END) repo-specific.*\n/gm, "");
  assert.equal(check(base, stripped).ok, false);
});

test("CLI exits 0 on a clean copy and 1 on drift", () => {
  const dir = mkdtempSync(join(tmpdir(), "drift-"));
  const good = join(dir, "good.yaml");
  const bad = join(dir, "bad.yaml");
  writeFileSync(good, withExtra(base));
  writeFileSync(bad, base.replace("[dev, main]", "[main]"));
  assert.equal(spawnSync("node", [script, good, basePath]).status, 0);
  assert.equal(spawnSync("node", [script, bad, basePath]).status, 1);
});
