import type * as z from 'zod';

import { toFieldErrors } from './issues.ts';
import { parseJsonText } from './json.ts';
import { InputLocation, upstreamError, type Problem } from './problem.ts';
import { readBodyText } from './read-body.ts';

export const DEFAULT_MAX_UPSTREAM_BYTES = 1024 * 1024;
export const DEFAULT_MAX_UPSTREAM_DEPTH = 64;

export const UpstreamFailureReason = {
  status: 'status',
  tooLarge: 'too-large',
  malformed: 'malformed',
  schema: 'schema',
} as const;

export type UpstreamFailureReason =
  (typeof UpstreamFailureReason)[keyof typeof UpstreamFailureReason];

export interface UpstreamIssue {
  readonly pointer: string;
  readonly detail: string;
}

/** What went wrong, for the server log. Never send it to the client. */
export interface UpstreamFailure {
  readonly reason: UpstreamFailureReason;
  /** The upstream HTTP status, when there was a response. */
  readonly status?: number;
  readonly issues: readonly UpstreamIssue[];
}

export type UpstreamResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly problem: Problem; readonly failure: UpstreamFailure };

export interface UpstreamOptions {
  /** Largest response read, in bytes. Default 1,048,576 (1 MiB). */
  readonly maxBytes?: number;
  /** Deepest nesting accepted. Default 64. */
  readonly maxDepth?: number;
}

function failed<T>(failure: UpstreamFailure): UpstreamResult<T> {
  return { ok: false, problem: upstreamError(), failure };
}

function withStatus(
  reason: UpstreamFailureReason,
  status: number | undefined,
  issues: readonly UpstreamIssue[] = []
): UpstreamFailure {
  return status === undefined ? { reason, issues } : { reason, status, issues };
}

function check<T extends z.ZodType>(
  data: unknown,
  schema: T,
  status: number | undefined
): UpstreamResult<z.output<T>> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues = toFieldErrors(parsed.error.issues, data, InputLocation.body).map((error) => ({
    pointer: error.pointer,
    detail: error.detail,
  }));
  return failed(withStatus(UpstreamFailureReason.schema, status, issues));
}

/**
 * Validates data another service returned, for example through its SDK. A
 * mismatch is the upstream's fault or yours, never the caller's, so the
 * problem is a 502.
 */
export function parseUpstreamData<T extends z.ZodType>(
  data: unknown,
  schema: T
): UpstreamResult<z.output<T>> {
  return check(data, schema, undefined);
}

/**
 * Reads and validates a JSON response from another service. A non-2xx
 * status, an oversized or malformed body and a schema mismatch all come back
 * as the same 502 problem, with the cause in `failure` for the log.
 */
export async function parseUpstreamResponse<T extends z.ZodType>(
  response: Response,
  schema: T,
  options: UpstreamOptions = {}
): Promise<UpstreamResult<z.output<T>>> {
  const { status } = response;
  if (!response.ok) {
    await response.body?.cancel();
    return failed(withStatus(UpstreamFailureReason.status, status));
  }
  const read = await readBodyText(response, options.maxBytes ?? DEFAULT_MAX_UPSTREAM_BYTES);
  if (!read.ok) {
    const reason =
      read.reason === 'too-large'
        ? UpstreamFailureReason.tooLarge
        : UpstreamFailureReason.malformed;
    return failed(withStatus(reason, status));
  }
  const json = parseJsonText(read.text, options.maxDepth ?? DEFAULT_MAX_UPSTREAM_DEPTH);
  if (!json.ok) return failed(withStatus(UpstreamFailureReason.malformed, status));
  return check(json.value, schema, status);
}
