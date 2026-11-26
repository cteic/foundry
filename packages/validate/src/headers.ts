import * as z from 'zod';

import { toFieldErrors } from './issues.ts';
import { failure, InputLocation, success, validationError, type ParseResult } from './problem.ts';
import { isSchema, type SchemaOrShape, type Shape, type StrippedOutput } from './schema.ts';

export type HeaderSource = Request | Headers;

function headersOf(source: HeaderSource): Headers {
  return source instanceof Headers ? source : source.headers;
}

/**
 * Parses request headers. A bare shape reads only the headers it names and
 * ignores the rest, because a client always sends headers the handler did not
 * ask for. A full schema receives every header, with lower-case names.
 */
export function parseHeaders<T extends z.ZodType>(
  source: HeaderSource,
  schema: T
): ParseResult<z.output<T>>;
export function parseHeaders<S extends Shape>(
  source: HeaderSource,
  shape: S
): ParseResult<StrippedOutput<S>>;
export function parseHeaders(
  source: HeaderSource,
  schemaOrShape: SchemaOrShape
): ParseResult<unknown> {
  const headers = headersOf(source);
  let schema: z.ZodType;
  let input: Record<string, string>;
  if (isSchema(schemaOrShape)) {
    schema = schemaOrShape;
    input = Object.fromEntries(headers);
  } else {
    schema = z.object(schemaOrShape);
    const named: [string, string][] = [];
    for (const name of Object.keys(schemaOrShape)) {
      const value = headers.get(name);
      if (value !== null) named.push([name, value]);
    }
    input = Object.fromEntries(named);
  }
  const parsed = schema.safeParse(input);
  if (parsed.success) return success(parsed.data);
  return failure(
    validationError(
      toFieldErrors(parsed.error.issues, input, InputLocation.header),
      InputLocation.header
    )
  );
}
