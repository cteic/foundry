import type * as z from 'zod';

import { toFieldErrors } from './issues.ts';
import { failure, InputLocation, success, validationError, type ParseResult } from './problem.ts';
import { strictSchema, type SchemaOrShape, type Shape, type StrictOutput } from './schema.ts';

/** Path parameters as a router hands them over: strings, or string arrays for a catch-all. */
export type PathParams = Readonly<Record<string, string | readonly string[] | undefined>>;

/** Parses path parameters. Every value arrives as a string: coerce in the schema. */
export function parseParams<T extends z.ZodType>(
  params: PathParams,
  schema: T
): ParseResult<z.output<T>>;
export function parseParams<S extends Shape>(
  params: PathParams,
  shape: S
): ParseResult<StrictOutput<S>>;
export function parseParams(
  params: PathParams,
  schemaOrShape: SchemaOrShape
): ParseResult<unknown> {
  const input = Object.fromEntries(Object.entries(params));
  const parsed = strictSchema(schemaOrShape).safeParse(input);
  if (parsed.success) return success(parsed.data);
  return failure(
    validationError(
      toFieldErrors(parsed.error.issues, input, InputLocation.path),
      InputLocation.path
    )
  );
}
