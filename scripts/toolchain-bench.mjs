#!/usr/bin/env node
// Times an app's format check, lint, typecheck, tests and build, and records the
// result in benchmarks/results/<app>/<date>-<label>.json.
//
//   node scripts/toolchain-bench.mjs --repo ~/src/tonnta --app tonnta --label baseline
//
// The app is cloned fresh at --ref (default origin/dev), so a local checkout,
// its branch and its caches never affect the numbers. Needs git, pnpm and hyperfine.
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseArgs, summarise, toolVersions } from './toolchain-bench-lib.mjs';

const foundry = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Every cache a step could read from. Deleted before each timed run, so each
// run does the full work. node_modules is left alone except its .cache folder.
const CLEAR_CACHES = [
  "find . -name node_modules -prune -o \\( -name '*.tsbuildinfo' -o -name .eslintcache -o -name .turbo \\) -print0 | xargs -0 rm -rf",
  "find . -name node_modules -prune -o -type d -path '*/.next/cache' -print0 | xargs -0 rm -rf",
  'find . -type d -path "*/node_modules/.cache" -prune -print0 | xargs -0 rm -rf',
].join('; ');

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options }).trim();
}

// A one-way hash of the hardware UUID. It tells two machines apart without
// publishing the UUID itself.
function machineId() {
  let raw = '';
  if (platform() === 'darwin') {
    const match = /"IOPlatformUUID" = "([^"]+)"/.exec(
      run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'])
    );
    raw = match?.[1] ?? '';
  } else {
    for (const path of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try {
        raw = readFileSync(path, 'utf8').trim();
        break;
      } catch {
        // Try the next path.
      }
    }
  }
  if (!raw) throw new Error('could not read a machine ID, so the run could not be compared later');
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function codeSize(dir) {
  const files = run('git', ['ls-files', '*.ts', '*.tsx', '*.mts', '*.cts'], {
    cwd: dir,
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean);
  let lines = 0;
  for (const file of files) {
    lines += readFileSync(join(dir, file), 'utf8').split('\n').length;
  }
  return { files: files.length, lines };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = resolve(options.repo.replace(/^~(?=\/)/, process.env.HOME ?? '~'));
  const url = run('git', ['-C', source, 'remote', 'get-url', 'origin']);

  const work = mkdtempSync(join(tmpdir(), 'toolchain-bench-'));
  const clone = join(work, options.app);
  try {
    console.log(`Cloning ${url} at ${options.ref}`);
    // --reference borrows the local checkout's objects, so the clone is quick.
    // A stale commit-graph in the local checkout can break it, so a failure
    // falls back to a plain clone.
    try {
      run('git', ['clone', '--quiet', '--dissociate', '--reference', source, url, clone], {
        stdio: 'pipe',
      });
    } catch {
      console.log('Clone with --reference failed, so cloning without it');
      rmSync(clone, { recursive: true, force: true });
      run('git', ['clone', '--quiet', url, clone]);
    }
    run('git', ['-C', clone, 'checkout', '--quiet', '--detach', options.ref]);
    const commit = run('git', ['-C', clone, 'rev-parse', 'HEAD']);

    console.log('Installing');
    execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd: clone, stdio: 'inherit' });

    const scripts = JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8')).scripts ?? {};
    const env = {
      ...process.env,
      TURBO_FORCE: 'true',
      TURBO_TELEMETRY_DISABLED: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    };

    const steps = {};
    for (const step of options.steps) {
      if (!(step in scripts)) {
        console.log(`Skipping ${step}: no such script`);
        continue;
      }
      console.log(`Timing ${step}`);
      const out = join(work, `${step.replace(':', '-')}.json`);
      execFileSync(
        'hyperfine',
        [
          '--runs',
          String(options.runs),
          '--warmup',
          '1',
          '--ignore-failure',
          '--prepare',
          CLEAR_CACHES,
          '--command-name',
          step,
          '--export-json',
          out,
          `pnpm run ${step}`,
        ],
        { cwd: clone, env, stdio: 'inherit' }
      );
      const [result] = JSON.parse(readFileSync(out, 'utf8')).results;
      steps[step] = summarise(result);
    }

    const capturedAt = new Date().toISOString();
    const date = capturedAt.slice(0, 10);
    const record = {
      app: options.app,
      label: options.label,
      date,
      capturedAt,
      commit,
      ref: options.ref,
      machine: {
        id: machineId(),
        chip: cpus()[0]?.model ?? 'unknown',
        cpus: cpus().length,
        memoryGb: Math.round(totalmem() / 1024 ** 3),
        os: `${platform()} ${release()}`,
      },
      runtime: {
        node: process.version,
        pnpm: run('pnpm', ['--version'], { cwd: clone }),
        hyperfine: run('hyperfine', ['--version']),
      },
      tools: toolVersions(
        JSON.parse(
          run('pnpm', ['ls', '--recursive', '--depth', '0', '--json'], {
            cwd: clone,
            maxBuffer: 64 * 1024 * 1024,
          })
        )
      ),
      code: codeSize(clone),
      method: {
        runs: options.runs,
        warmup: 1,
        cachesCleared:
          'Turborepo (TURBO_FORCE), tsbuildinfo, .eslintcache, .next/cache, node_modules/.cache',
      },
      steps,
    };

    const dir = join(foundry, 'benchmarks', 'results', options.app);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${date}-${options.label}.json`);
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`Wrote ${file}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
