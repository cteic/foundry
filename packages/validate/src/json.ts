export type JsonTextResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: 'empty' | 'too-deep' | 'syntax' }
  | { readonly ok: false; readonly reason: 'forbidden-key'; readonly path: readonly string[] };

/**
 * Counts bracket depth without parsing, so a body of 100,000 `[` characters
 * is refused before anything recursive walks it.
 */
export function exceedsDepth(text: string, maxDepth: number): boolean {
  let depth = 0;
  let isInString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (isInString) {
      if (char === '\\') index += 1;
      else if (char === '"') isInString = false;
    } else if (char === '"') {
      isInString = true;
    } else if (char === '{' || char === '[') {
      depth += 1;
      if (depth > maxDepth) return true;
    } else if (char === '}' || char === ']') {
      depth -= 1;
    }
  }
  return false;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/**
 * `JSON.parse` makes `__proto__` an ordinary own key, which is harmless until
 * something merges the object into another one. `constructor.prototype` is
 * the other route to the same place. Find either so the caller can refuse.
 */
export function findForbiddenKey(value: unknown): readonly string[] | undefined {
  const pending: { readonly node: unknown; readonly path: readonly string[] }[] = [
    { node: value, path: [] },
  ];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const { node, path } = next;
    if (!isObject(node)) continue;
    for (const [key, child] of Object.entries(node)) {
      const childPath = [...path, key];
      if (key === '__proto__') return childPath;
      if (key === 'constructor' && isObject(child) && Object.hasOwn(child, 'prototype')) {
        return childPath;
      }
      pending.push({ node: child, path: childPath });
    }
  }
  return undefined;
}

export function parseJsonText(text: string, maxDepth: number): JsonTextResult {
  if (text.trim().length === 0) return { ok: false, reason: 'empty' };
  if (exceedsDepth(text, maxDepth)) return { ok: false, reason: 'too-deep' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'syntax' };
  }
  const forbidden = findForbiddenKey(value);
  if (forbidden !== undefined) return { ok: false, reason: 'forbidden-key', path: forbidden };
  return { ok: true, value };
}
