import type * as z from 'zod';

import { toFieldErrors } from './issues.ts';
import { failure, InputLocation, success, validationError, type ParseResult } from './problem.ts';
import { strictSchema, type SchemaOrShape, type Shape, type StrictOutput } from './schema.ts';

export type QuerySource = Request | URL | URLSearchParams;

function searchParams(source: QuerySource): URLSearchParams {
  if (source instanceof URLSearchParams) return source;
  if (source instanceof URL) return source.searchParams;
  return new URL(source.url).searchParams;
}

/**
 * A key sent once becomes a string. A key sent more than once becomes an
 * array, so a schema that expects one value rejects the repeat instead of
 * silently taking the first or the last.
 */
export function queryRecord(source: QuerySource): Record<string, string | string[]> {
  const values = new Map<string, string[]>();
  for (const [key, value] of searchParams(source)) {
    const seen = values.get(key);
    if (seen === undefined) values.set(key, [value]);
    else seen.push(value);
  }
  const entries: [string, string | string[]][] = [];
  for (const [key, list] of values) {
    const [first] = list;
    if (first !== undefined) entries.push([key, list.length === 1 ? first : list]);
  }
  return Object.fromEntries(entries);
}

/** Parses the query string. Every value arrives as a string: coerce in the schema. */
export function parseQuery<T extends z.ZodType>(
  source: QuerySource,
  schema: T
): ParseResult<z.output<T>>;
export function parseQuery<S extends Shape>(
  source: QuerySource,
  shape: S
): ParseResult<StrictOutput<S>>;
export function parseQuery(
  source: QuerySource,
  schemaOrShape: SchemaOrShape
): ParseResult<unknown> {
  const input = queryRecord(source);
  const parsed = strictSchema(schemaOrShape).safeParse(input);
  if (parsed.success) return success(parsed.data);
  return failure(
    validationError(
      toFieldErrors(parsed.error.issues, input, InputLocation.query),
      InputLocation.query
    )
  );
}
