import { describe, expect, it } from 'vitest';

import { checkPackageManager, checkWorkspace } from './policy.ts';

const baseline = `packages:
  - packages/*

minimumReleaseAge: 4320
minimumReleaseAgeExclude:
  - '@cteic/*'
minimumReleaseAgeStrict: true
strictDepBuilds: true
blockExoticSubdeps: true
trustPolicy: no-downgrade

allowBuilds:
  # esbuild downloads its platform binary in postinstall
  esbuild: true
  core-js: false
`;

function settings(text: string): string[] {
  return checkWorkspace(text).map((finding) => finding.setting);
}

describe('checkWorkspace', () => {
  it('passes the baseline', () => {
    expect(checkWorkspace(baseline)).toEqual([]);
  });

  it('fails an empty workspace file on every required setting', () => {
    expect(settings('packages:\n  - .\n')).toEqual([
      'minimumReleaseAge',
      'minimumReleaseAgeStrict',
      'strictDepBuilds',
      'blockExoticSubdeps',
      'trustPolicy',
    ]);
  });

  it('fails a release age shorter than 3 days', () => {
    expect(settings(baseline.replace('4320', '1440'))).toEqual(['minimumReleaseAge']);
  });

  it('passes a release age longer than 3 days', () => {
    expect(checkWorkspace(baseline.replace('4320', '10080'))).toEqual([]);
  });

  it.each([
    ['minimumReleaseAgeStrict: true', 'minimumReleaseAgeStrict: false', 'minimumReleaseAgeStrict'],
    ['strictDepBuilds: true', 'strictDepBuilds: false', 'strictDepBuilds'],
    ['blockExoticSubdeps: true', 'blockExoticSubdeps: false', 'blockExoticSubdeps'],
    ['trustPolicy: no-downgrade', 'trustPolicy: off', 'trustPolicy'],
  ])('fails when %s is changed', (from, to, setting) => {
    expect(settings(baseline.replace(from, to))).toEqual([setting]);
  });

  it('fails dangerouslyAllowAllBuilds: true', () => {
    expect(settings(`${baseline}dangerouslyAllowAllBuilds: true\n`)).toEqual([
      'dangerouslyAllowAllBuilds',
    ]);
  });

  it('allows dangerouslyAllowAllBuilds: false', () => {
    expect(checkWorkspace(`${baseline}dangerouslyAllowAllBuilds: false\n`)).toEqual([]);
  });

  it.each(['onlyBuiltDependencies', 'neverBuiltDependencies', 'ignoredBuiltDependencies'])(
    'fails the removed setting %s',
    (setting) => {
      expect(settings(`${baseline}${setting}:\n  - esbuild\n`)).toEqual([setting]);
    }
  );

  it('fails an approved build with no reason', () => {
    const findings = checkWorkspace(`${baseline}  sharp: true\n`);
    expect(findings).toEqual([
      {
        setting: 'allowBuilds',
        message: '"sharp" may run install scripts. Add a comment on or above the entry saying why.',
      },
    ]);
  });

  it('accepts a reason as a trailing comment', () => {
    expect(checkWorkspace(`${baseline}  sharp: true # native image library\n`)).toEqual([]);
  });

  it('accepts a reason on the line above a later entry', () => {
    expect(checkWorkspace(`${baseline}  # native image library\n  sharp: true\n`)).toEqual([]);
  });

  it('needs no reason for a denied build', () => {
    expect(checkWorkspace(`${baseline}  bufferutil: false\n`)).toEqual([]);
  });

  it('fails a build approval that is not a boolean', () => {
    expect(settings(`${baseline}  sharp: yes please\n`)).toEqual(['allowBuilds']);
  });

  it('fails an allowBuilds list', () => {
    const text = baseline.replace(/allowBuilds:[\s\S]*$/, 'allowBuilds:\n  - esbuild\n');
    expect(settings(text)).toEqual(['allowBuilds']);
  });

  it('fails a third-party release-age exclusion with no reason', () => {
    const text = baseline.replace("  - '@cteic/*'\n", "  - '@cteic/*'\n  - left-pad\n");
    expect(settings(text)).toEqual(['minimumReleaseAgeExclude']);
  });

  it('accepts a third-party release-age exclusion with a reason', () => {
    const text = baseline.replace(
      "  - '@cteic/*'\n",
      "  - '@cteic/*'\n  - left-pad@1.3.1 # security fix CVE-0000-0000, reviewed\n"
    );
    expect(checkWorkspace(text)).toEqual([]);
  });

  it('fails a trust exclusion with no reason', () => {
    expect(settings(`${baseline}trustPolicyExclude:\n  - chokidar@4.0.3\n`)).toEqual([
      'trustPolicyExclude',
    ]);
  });

  it('accepts a trust exclusion with a reason', () => {
    const text = `${baseline}trustPolicyExclude:\n  # republished from a laptop after a CI outage\n  - chokidar@4.0.3\n`;
    expect(checkWorkspace(text)).toEqual([]);
  });

  it('fails trustPolicyIgnoreAfter with no reason', () => {
    expect(settings(`${baseline}trustPolicyIgnoreAfter: 525600\n`)).toEqual([
      'trustPolicyIgnoreAfter',
    ]);
  });

  it('reports a YAML syntax error', () => {
    expect(settings('allowBuilds: [\n')).toEqual(['pnpm-workspace.yaml']);
  });
});

describe('checkPackageManager', () => {
  it('passes pnpm 11', () => {
    expect(checkPackageManager({ packageManager: 'pnpm@11.5.2' })).toEqual([]);
  });

  it('passes a pin with an integrity hash', () => {
    expect(checkPackageManager({ packageManager: 'pnpm@11.5.2+sha512.abc' })).toEqual([]);
  });

  it.each([
    [{ packageManager: 'pnpm@10.18.0' }],
    [{ packageManager: 'npm@11.0.0' }],
    [{}],
    ['not an object'],
  ])('fails %j', (manifest) => {
    expect(checkPackageManager(manifest).map((finding) => finding.setting)).toEqual([
      'packageManager',
    ]);
  });
});
