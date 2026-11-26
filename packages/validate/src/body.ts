import type * as z from 'zod';

import { toFieldErrors, toPointer } from './issues.ts';
import { parseJsonText } from './json.ts';
import {
  contentTooLarge,
  failure,
  InputLocation,
  malformedBody,
  success,
  unsupportedMediaType,
  validationError,
  type ParseResult,
  type Problem,
} from './problem.ts';
import { readBodyText } from './read-body.ts';
import { strictSchema, type SchemaOrShape, type Shape, type StrictOutput } from './schema.ts';

export const DEFAULT_MAX_BODY_BYTES = 100 * 1024;
export const DEFAULT_MAX_DEPTH = 32;

export interface BodyOptions {
  /** Largest body accepted, in bytes. Default 102,400 (100 KiB). */
  readonly maxBytes?: number;
  /** Deepest nesting of objects and arrays accepted. Default 32. */
  readonly maxDepth?: number;
}

const JSON_MEDIA_TYPE = /^application\/(?:[\w.-]+\+)?json$/;

export function isJsonContentType(header: string | null): boolean {
  if (header === null) return false;
  const mediaType = header.split(';', 1)[0] ?? '';
  return JSON_MEDIA_TYPE.test(mediaType.trim().toLowerCase());
}

function encodingProblem(headers: Headers): Problem | undefined {
  const encoding = headers.get('content-encoding');
  if (encoding === null || encoding.trim().toLowerCase() === 'identity') return undefined;
  return unsupportedMediaType('Send the body without a Content-Encoding.');
}

/**
 * Reads the raw body as text under the size cap, with no content type check.
 * Use it where the exact bytes matter, such as verifying a webhook signature
 * before parsing.
 */
export async function readText(
  request: Request,
  options: Pick<BodyOptions, 'maxBytes'> = {}
): Promise<ParseResult<string>> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  const read = await readBodyText(request, maxBytes);
  if (read.ok) return success(read.text);
  if (read.reason === 'too-large') return failure(contentTooLarge(maxBytes));
  return failure(malformedBody('The request body is not valid UTF-8.'));
}

/**
 * Parses a JSON request body. Checks run from cheap to costly: content type,
 * size, encoding, JSON syntax and depth, forbidden keys, then the schema.
 */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  options?: BodyOptions
): Promise<ParseResult<z.output<T>>>;
export async function parseJsonBody<S extends Shape>(
  request: Request,
  shape: S,
  options?: BodyOptions
): Promise<ParseResult<StrictOutput<S>>>;
export async function parseJsonBody(
  request: Request,
  schemaOrShape: SchemaOrShape,
  options: BodyOptions = {}
): Promise<ParseResult<unknown>> {
  if (!isJsonContentType(request.headers.get('content-type'))) {
    return failure(unsupportedMediaType('Send the body as application/json.'));
  }
  const encoded = encodingProblem(request.headers);
  if (encoded !== undefined) return failure(encoded);

  const text = await readText(request, options);
  if (!text.ok) return text;

  const json = parseJsonText(text.data, options.maxDepth ?? DEFAULT_MAX_DEPTH);
  if (!json.ok) {
    switch (json.reason) {
      case 'empty':
        return failure(malformedBody('The request body is empty.'));
      case 'too-deep':
        return failure(malformedBody('The request body is nested too deeply.'));
      case 'syntax':
        return failure(malformedBody('The request body is not valid JSON.'));
      case 'forbidden-key':
        return failure(
          validationError(
            [
              {
                in: InputLocation.body,
                pointer: toPointer(json.path),
                detail: 'This key is not allowed',
              },
            ],
            InputLocation.body
          )
        );
    }
  }

  const parsed = await strictSchema(schemaOrShape).safeParseAsync(json.value);
  if (parsed.success) return success(parsed.data);
  return failure(
    validationError(
      toFieldErrors(parsed.error.issues, json.value, InputLocation.body),
      InputLocation.body
    )
  );
}
