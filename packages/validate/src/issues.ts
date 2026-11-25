import type * as z from 'zod';

import type { FieldError, InputLocation } from './problem.ts';

const MAX_ERRORS = 20;
const MAX_SEGMENT_LENGTH = 64;
const MAX_DETAIL_LENGTH = 200;
const MIN_REDACT_LENGTH = 4;
const REDACTED = '[redacted]';

function isIndexable(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let current = input;
  for (const key of path) {
    if (!isIndexable(current) || typeof key === 'symbol' || !Object.hasOwn(current, key)) {
      return undefined;
    }
    current = current[String(key)];
  }
  return current;
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** RFC 6901 escaping, then percent-encoding so the pointer is a valid URI fragment. */
function pointerSegment(key: PropertyKey): string {
  const escaped = shorten(String(key), MAX_SEGMENT_LENGTH)
    .replaceAll('~', '~0')
    .replaceAll('/', '~1');
  return encodeURIComponent(escaped);
}

export function toPointer(path: readonly PropertyKey[]): string {
  return `#${path.map((key) => `/${pointerSegment(key)}`).join('')}`;
}

/**
 * Zod's own messages name types and limits, never the value. A custom message
 * can still interpolate the value, so cut it back out before it leaves.
 */
function scrub(message: string, value: unknown): string {
  const text = typeof value === 'string' && value.length >= MIN_REDACT_LENGTH ? value : undefined;
  const safe = text === undefined ? message : message.replaceAll(text, REDACTED);
  return shorten(safe, MAX_DETAIL_LENGTH);
}

function detailFor(issue: z.core.$ZodIssue, value: unknown): string {
  if (issue.code === 'invalid_type' && value === undefined) return 'Required';
  return scrub(issue.message, value);
}

export function toFieldErrors(
  issues: readonly z.core.$ZodIssue[],
  input: unknown,
  location: InputLocation
): FieldError[] {
  const errors: FieldError[] = [];
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        errors.push({
          in: location,
          pointer: toPointer([...issue.path, key]),
          detail: 'Unknown field',
        });
      }
    } else {
      errors.push({
        in: location,
        pointer: toPointer(issue.path),
        detail: detailFor(issue, valueAt(input, issue.path)),
      });
    }
  }
  return errors.slice(0, MAX_ERRORS);
}
