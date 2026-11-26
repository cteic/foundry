export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

const TYPE_BASE = 'https://github.com/cteic/foundry/blob/main/packages/validate/README.md#';

export const InputLocation = {
  body: 'body',
  query: 'query',
  path: 'path',
  header: 'header',
} as const;

export type InputLocation = (typeof InputLocation)[keyof typeof InputLocation];

/** One field that failed. `pointer` is a JSON Pointer (RFC 6901) in URI fragment form. */
export interface FieldError {
  readonly in: InputLocation;
  readonly pointer: string;
  readonly detail: string;
}

/** RFC 9457 problem details, plus the `errors` extension member. */
export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
}

export interface ParseSuccess<T> {
  readonly ok: true;
  readonly data: T;
}

export interface ParseFailure {
  readonly ok: false;
  readonly problem: Problem;
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export function success<T>(data: T): ParseSuccess<T> {
  return { ok: true, data };
}

export function failure(problem: Problem): ParseFailure {
  return { ok: false, problem };
}

export function unsupportedMediaType(detail: string): Problem {
  return {
    type: `${TYPE_BASE}unsupported-media-type`,
    title: 'Unsupported media type',
    status: 415,
    detail,
  };
}

export function contentTooLarge(maxBytes: number): Problem {
  return {
    type: `${TYPE_BASE}content-too-large`,
    title: 'Request body too large',
    status: 413,
    detail: `The request body must be at most ${String(maxBytes)} bytes.`,
  };
}

export function malformedBody(detail: string): Problem {
  return {
    type: `${TYPE_BASE}malformed-body`,
    title: 'Malformed request body',
    status: 400,
    detail,
  };
}

/**
 * 422 for a body that parsed but broke the schema. 400 for the query string,
 * path and headers, which are not request content.
 */
export function validationError(errors: readonly FieldError[], location: InputLocation): Problem {
  return {
    type: `${TYPE_BASE}validation-error`,
    title: 'Request validation failed',
    status: location === InputLocation.body ? 422 : 400,
    detail: `The request ${location} is not valid.`,
    errors,
  };
}

export function upstreamError(): Problem {
  return {
    type: `${TYPE_BASE}upstream-error`,
    title: 'Upstream service error',
    status: 502,
    detail: 'A service this request depends on returned a response that could not be used.',
  };
}

export interface ProblemResponseOptions {
  /** Extra response headers, for example CORS headers. */
  readonly headers?: HeadersInit;
}

export function problemResponse(problem: Problem, options: ProblemResponseOptions = {}): Response {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', PROBLEM_CONTENT_TYPE);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(problem), { status: problem.status, headers });
}
