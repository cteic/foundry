import { isMap, isScalar, isSeq, parseDocument, type Document, type Node } from 'yaml';

export interface Finding {
  setting: string;
  message: string;
}

export const minimumReleaseAgeMinutes = 4320;

export const ownScope = '@cteic/';

export const requiredSettings = {
  minimumReleaseAgeStrict: true,
  strictDepBuilds: true,
  blockExoticSubdeps: true,
  trustPolicy: 'no-downgrade',
} as const;

export const removedSettings = [
  'onlyBuiltDependencies',
  'onlyBuiltDependenciesFile',
  'neverBuiltDependencies',
  'ignoredBuiltDependencies',
  'ignoreDepScripts',
] as const;

export const minimumPnpmMajor = 11;

interface Collection {
  commentBefore?: string | null | undefined;
}

function hasText(comment: string | null | undefined): boolean {
  return typeof comment === 'string' && comment.trim() !== '';
}

function hasReason(node: Node | null | undefined, collection: Collection, index: number): boolean {
  if (node === null || node === undefined) {
    return false;
  }
  if (hasText(node.comment) || hasText(node.commentBefore)) {
    return true;
  }
  return index === 0 && hasText(collection.commentBefore);
}

function checkReleaseAge(doc: Document, findings: Finding[]): void {
  const age = doc.get('minimumReleaseAge');
  if (typeof age !== 'number' || age < minimumReleaseAgeMinutes) {
    findings.push({
      setting: 'minimumReleaseAge',
      message: `must be ${String(minimumReleaseAgeMinutes)} or more (minutes, 3 days). Got ${JSON.stringify(age ?? null)}.`,
    });
  }
  const exclude = doc.get('minimumReleaseAgeExclude', true);
  if (exclude === undefined || exclude === null) {
    return;
  }
  if (!isSeq(exclude)) {
    findings.push({ setting: 'minimumReleaseAgeExclude', message: 'must be a list.' });
    return;
  }
  exclude.items.forEach((item, index) => {
    const entry = isScalar(item) ? String(item.value) : JSON.stringify(item);
    if (entry.startsWith(ownScope)) {
      return;
    }
    if (!isScalar(item) || !hasReason(item, exclude, index)) {
      findings.push({
        setting: 'minimumReleaseAgeExclude',
        message: `"${entry}" skips the release-age wait. Add a comment on or above the entry saying why.`,
      });
    }
  });
}

function checkExactSettings(doc: Document, findings: Finding[]): void {
  for (const [setting, expected] of Object.entries(requiredSettings)) {
    const actual = doc.get(setting);
    if (actual !== expected) {
      findings.push({
        setting,
        message: `must be ${JSON.stringify(expected)}. Got ${JSON.stringify(actual ?? null)}.`,
      });
    }
  }
  if (doc.get('dangerouslyAllowAllBuilds') === true) {
    findings.push({
      setting: 'dangerouslyAllowAllBuilds',
      message: 'must not be true. It lets every dependency run install scripts.',
    });
  }
  for (const setting of removedSettings) {
    if (doc.has(setting)) {
      findings.push({
        setting,
        message: 'is removed in pnpm 11 and has no effect. List build approvals under allowBuilds.',
      });
    }
  }
}

function checkAllowBuilds(doc: Document, findings: Finding[]): void {
  const builds = doc.get('allowBuilds', true);
  if (builds === undefined || builds === null) {
    return;
  }
  if (!isMap(builds)) {
    findings.push({
      setting: 'allowBuilds',
      message: 'must be a map of package to true or false.',
    });
    return;
  }
  builds.items.forEach((pair, index) => {
    const name = isScalar(pair.key) ? String(pair.key.value) : JSON.stringify(pair.key);
    const value = isScalar(pair.value) ? pair.value.value : undefined;
    if (typeof value !== 'boolean') {
      findings.push({ setting: 'allowBuilds', message: `"${name}" must be true or false.` });
      return;
    }
    if (!value) {
      return;
    }
    const keyNode = isScalar(pair.key) ? pair.key : null;
    const valueNode = isScalar(pair.value) ? pair.value : null;
    if (!hasReason(keyNode, builds, index) && !hasReason(valueNode, builds, -1)) {
      findings.push({
        setting: 'allowBuilds',
        message: `"${name}" may run install scripts. Add a comment on or above the entry saying why.`,
      });
    }
  });
}

function checkTrustExclusions(doc: Document, findings: Finding[]): void {
  const exclude = doc.get('trustPolicyExclude', true);
  if (exclude !== undefined && exclude !== null) {
    if (!isSeq(exclude)) {
      findings.push({ setting: 'trustPolicyExclude', message: 'must be a list.' });
    } else {
      exclude.items.forEach((item, index) => {
        if (!isScalar(item) || !hasReason(item, exclude, index)) {
          const entry = isScalar(item) ? String(item.value) : JSON.stringify(item);
          findings.push({
            setting: 'trustPolicyExclude',
            message: `"${entry}" skips the trust check. Add a comment on or above the entry saying why.`,
          });
        }
      });
    }
  }
  const ignoreAfter = doc.get('trustPolicyIgnoreAfter', true);
  if (ignoreAfter !== undefined && ignoreAfter !== null) {
    const node = isScalar(ignoreAfter) ? ignoreAfter : null;
    if (!hasReason(node, {}, -1)) {
      findings.push({
        setting: 'trustPolicyIgnoreAfter',
        message: 'skips the trust check for older releases. Add a comment saying why.',
      });
    }
  }
}

export function checkWorkspace(text: string): Finding[] {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    return doc.errors.map((error) => ({ setting: 'pnpm-workspace.yaml', message: error.message }));
  }
  if (doc.contents !== null && !isMap(doc.contents)) {
    return [{ setting: 'pnpm-workspace.yaml', message: 'must hold a map of settings.' }];
  }
  const findings: Finding[] = [];
  checkReleaseAge(doc, findings);
  checkExactSettings(doc, findings);
  checkAllowBuilds(doc, findings);
  checkTrustExclusions(doc, findings);
  return findings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function checkPackageManager(manifest: unknown): Finding[] {
  const field = isRecord(manifest) ? manifest.packageManager : undefined;
  const match = typeof field === 'string' ? /^pnpm@(\d+)\./.exec(field) : null;
  const major = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  if (Number.isNaN(major) || major < minimumPnpmMajor) {
    return [
      {
        setting: 'packageManager',
        message: `must pin pnpm ${String(minimumPnpmMajor)} or later, for example "pnpm@11.5.2". Got ${JSON.stringify(field ?? null)}. Older pnpm ignores allowBuilds.`,
      },
    ];
  }
  return [];
}
