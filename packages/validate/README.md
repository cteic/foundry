# @cteic/validate

Typed parsing for the edges of an HTTP handler: the JSON body, the query string, path parameters, headers, and the responses of services you call. Built on [Zod 4](https://zod.dev) and the Web `Request` and `Response` types, so it runs on Node, Cloudflare Workers and Next.js route handlers. It has no framework dependency.

```ts
const body = await parseJsonBody(request, { email: z.email(), age: z.int().min(18) });
if (!body.ok) return problemResponse(body.problem);

body.data; // { email: string; age: number }
```

Every helper returns a result, `{ ok: true, data }` or `{ ok: false, problem }`. Bad input is an expected outcome, so it is a value you must handle, not an exception you might forget to catch.

## Install

```sh
pnpm add @cteic/validate zod
```

Zod is a peer dependency (`^4.0.0`), so your schemas and this package share one copy.

## What to validate, and where

Input crosses four checkpoints on its way to storage. Each one has a different job.

| Checkpoint      | Job                                                    | Can an attacker skip it?              |
| --------------- | ------------------------------------------------------ | ------------------------------------- |
| Client form     | Fast feedback for an honest user                       | Yes. `curl` never runs your form code |
| Server boundary | Decide what the system accepts. The security boundary  | No                                    |
| Business rules  | Checks that need state: ownership, balance, uniqueness | No                                    |
| Database        | Hold the invariants when two requests race             | No                                    |

The rules that follow from that:

1. **Client validation is user experience.** The server never trusts it. Validate again on the server even when the client used the same schema.
2. **Parse, don't validate.** A validator answers yes or no and leaves you holding the same `unknown` value. A parser returns a new value with a precise type, or an error. After the parse, the type is the proof. Code past the boundary never checks again and never needs a cast.
3. **Parse once, at the edge.** The handler turns `unknown` into typed data in its first lines. Functions deeper in take the typed value.
4. **Accept a known shape, reject the rest.** List what is allowed. Do not try to list what is dangerous.
5. **Validation is not authorisation.** A schema can say `role` is `'member'` or `'admin'`. Only a permission check can say this caller may grant `'admin'`.
6. **The database is the last line.** A `UNIQUE`, `NOT NULL`, `CHECK` or foreign key constraint still holds when two requests pass the same application check at the same moment. Catch the constraint error and answer 409.
7. **Validation does not replace output encoding.** A valid display name can still contain `<script>`. Use parameterised queries for SQL and escape on output for HTML.
8. **Responses from other services are input too.** A third-party API can change shape, fail, or be compromised. Parse what it returns before you use it.

## A worked example

A route that invites a member to a team: `POST /teams/:teamId/invites?dryRun=true`.

```ts
import * as z from 'zod';

import {
  booleanFromString,
  intFromString,
  parseJsonBody,
  parseParams,
  parseQuery,
  problemResponse,
  text,
} from '@cteic/validate';

// Path and query values arrive as strings, so these schemas convert them.
const params = { teamId: intFromString().pipe(z.int().positive()) };
const query = { dryRun: booleanFromString().default(false) };

// A JSON body carries real types, so nothing is converted. A string where a
// number belongs is a client bug, and the client should hear about it.
const invite = {
  email: z.email().max(254),
  displayName: text({ max: 80 }),
  role: z.enum(['member', 'admin']),
};

export async function createInvite(
  request: Request,
  rawParams: { teamId: string },
  session: Session
): Promise<Response> {
  const path = parseParams(rawParams, params);
  if (!path.ok) return problemResponse(path.problem);

  const search = parseQuery(request, query);
  if (!search.ok) return problemResponse(search.problem);

  const body = await parseJsonBody(request, invite, { maxBytes: 4 * 1024 });
  if (!body.ok) return problemResponse(body.problem);

  // Typed from here: path.data.teamId is a number, body.data.role is a union.
  // Shape is settled. Permission is a separate question.
  if (!session.canInvite(path.data.teamId, body.data.role)) {
    return new Response(null, { status: 403 });
  }
  if (search.data.dryRun) return Response.json({ ok: true });

  // The table has UNIQUE (team_id, email). Two identical requests can both
  // pass a "does it exist" check, so the constraint decides.
  const saved = await session.invites.insert(path.data.teamId, body.data);
  return saved.conflict
    ? new Response(null, { status: 409 })
    : Response.json(saved.invite, { status: 201 });
}
```

Authenticate and rate-limit before you read the body. Both are cheaper than parsing, and neither needs the payload.

## API

| Function                                            | Input                                   | On failure           |
| --------------------------------------------------- | --------------------------------------- | -------------------- |
| `parseJsonBody(request, schema, options?)`          | JSON request body. Async                | 415, 413, 400 or 422 |
| `parseQuery(source, schema)`                        | `Request`, `URL` or `URLSearchParams`   | 400                  |
| `parseParams(params, schema)`                       | The params object from your router      | 400                  |
| `parseHeaders(source, schema)`                      | `Request` or `Headers`                  | 400                  |
| `readText(request, options?)`                       | Raw body text under the size cap        | 413 or 400           |
| `parseUpstreamResponse(response, schema, options?)` | A `fetch` response from another service | 502                  |
| `parseUpstreamData(data, schema)`                   | Data an SDK already decoded             | 502                  |
| `problemResponse(problem, { headers }?)`            | Builds the error `Response`             |                      |

`schema` is a Zod schema, or a bare shape such as `{ email: z.email() }`.

- A bare shape becomes `z.strictObject(shape)`: an unknown key is an error. This is the default because a silently dropped field hides bugs (a typo in an optional field) and probing (`"isAdmin": true`).
- A full schema is used exactly as you wrote it. Pass `z.object(shape)` to drop unknown keys instead. Strictness does not cascade, so nested objects need `z.strictObject` too.
- `parseHeaders` is the exception. A bare shape reads only the headers it names, because every client sends headers you did not ask for.

The result type comes from the schema through `z.output`. Derive your own types the same way, with `z.infer<typeof schema>`, so the type and the check cannot drift apart.

`parseJsonBody` options: `maxBytes` (default 102,400) and `maxDepth` (default 32). Set `maxBytes` per route, to the smallest size the route needs.

## Errors

Failures use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) problem details, served as `application/problem+json`. RFC 9457 replaces RFC 7807. One shape for every error means a client writes its error handling once.

```json
{
  "type": "https://github.com/cteic/foundry/blob/main/packages/validate/README.md#validation-error",
  "title": "Request validation failed",
  "status": 422,
  "detail": "The request body is not valid.",
  "errors": [
    { "in": "body", "pointer": "#/email", "detail": "Invalid email address" },
    {
      "in": "body",
      "pointer": "#/profile/pets/1",
      "detail": "Invalid input: expected string, received number"
    },
    { "in": "body", "pointer": "#/isAdmin", "detail": "Unknown field" }
  ]
}
```

`type`, `title`, `status` and `detail` are the standard members. `errors` is an extension member, modelled on the example in RFC 9457 section 3: each entry has a `detail` and a `pointer`, a JSON Pointer ([RFC 6901](https://www.rfc-editor.org/rfc/rfc6901.html)) to the field. `in` says which part of the request the pointer is relative to: `body`, `query`, `path` or `header`. At most 20 errors are returned.

Clients should switch on `type`, not on `title` or `detail`. The wording can change. The type will not.

### Which status, and why

| Status | Type                     | When                                                                                                   |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| 415    | `unsupported-media-type` | `Content-Type` is not `application/json` or `application/*+json`, or the body has a `Content-Encoding` |
| 413    | `content-too-large`      | The body is over `maxBytes`                                                                            |
| 400    | `malformed-body`         | The body is empty, not UTF-8, not JSON, or nested deeper than `maxDepth`                               |
| 422    | `validation-error`       | The body is well-formed JSON that breaks the schema                                                    |
| 400    | `validation-error`       | The query string, a path parameter or a header breaks the schema                                       |
| 502    | `upstream-error`         | Another service returned something unusable                                                            |

The line between 400 and 422 follows [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html). Section 15.5.1 gives 400 for "malformed request syntax". Section 15.5.21 gives 422 when the server "understands the content type of the request content", "the syntax of the request content is correct", but it cannot process the instructions. So:

- **400: the server could not read it.** Retrying the same bytes will never work. The client has an encoding bug.
- **422: the server read it and the values are wrong.** The client can show `errors` next to the form fields.

Query, path and header failures stay at 400 because 422 is defined in terms of request content, and those are not content.

A handler may answer 404 instead of 400 for a bad path parameter if it should not reveal which identifiers are well-formed. Authentication failures are 401 and are not this package's job: a missing `Authorization` header is not a validation error.

### `unsupported-media-type`

Send JSON with `Content-Type: application/json`, uncompressed. The check also blocks a cross-site HTML form post, which can send only `text/plain`, `multipart/form-data` or `application/x-www-form-urlencoded` without a CORS preflight.

### `content-too-large`

Send a smaller body. `detail` states the limit.

### `malformed-body`

The body could not be read as JSON. `detail` says which check failed. It never quotes the body.

### `validation-error`

Fix the fields listed in `errors`.

### `upstream-error`

The request was fine. A service behind this one failed. Retry later.

## Hostile input

| Input                                                        | What happens                                                                                                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body larger than the cap                                     | `Content-Length` over the cap is refused before a byte is read. The stream is then counted as it arrives and cancelled at the cap, because the header can be absent or false. Bytes are counted, not characters |
| 100,000 nested `[`                                           | Refused by a bracket count before `JSON.parse`. `JSON.parse` survives that input, but the next recursive walk over the result overflows the stack                                                               |
| `"__proto__"` or `"constructor": { "prototype": … }` in JSON | Refused at any depth, whatever the schema. `JSON.parse` stores `__proto__` as a plain own key, which is harmless until some code merges the object into another and pollutes the prototype                      |
| Unknown keys                                                 | One error per key under a bare shape                                                                                                                                                                            |
| `?page=1&page=2`                                             | A repeated key becomes an array, so a schema that expects one value rejects it. Otherwise two layers could disagree on first or last. Use `repeated(item)` where a list is intended                             |
| `?__proto__=x`                                               | Stored as an ordinary own key and rejected as unknown                                                                                                                                                           |
| Wrong types, `null`, an array for an object                  | 422 with a pointer to the field                                                                                                                                                                                 |
| Secrets in rejected input                                    | Never echoed. See below                                                                                                                                                                                         |

### Errors never echo input

A rejected value may be a password, a token or a card number, and error responses end up in logs, monitoring and screenshots. So:

- Zod's messages name the expected type or limit, not the value. Zod can attach the input to an issue (`reportInput`). This package never turns that on.
- If a custom message interpolates the value, the value is replaced with `[redacted]` before the error is built.
- A JSON syntax error returns a fixed sentence. The runtime's own message quotes part of the body, so it is dropped.

Field names are returned, since the client needs them. Names longer than 64 characters are shortened.

## Converting strings

A query string and a path carry only strings. JSON carries numbers and booleans. So conversion belongs to `parseQuery` and `parseParams` schemas, and never to a body schema.

Do not use `z.coerce` for this. It applies the JavaScript constructors, which accept far too much:

| Zod built-in         | Surprise                                    | Use instead                             | Accepts                                               |
| -------------------- | ------------------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| `z.coerce.number()`  | `''` becomes `0`. `'0x10'` and `'1e3'` pass | `intFromString()`, `numberFromString()` | Plain digits, optional `-`, at most 15 integer digits |
| `z.coerce.boolean()` | `'false'` becomes `true`                    | `booleanFromString()`                   | `true`, `false`, `1`, `0`                             |
| `z.coerce.date()`    | `'1'` becomes 1 January 2001                | `dateFromString()`                      | ISO 8601 date, or date-time with an offset            |

Each helper returns a Zod schema. Add limits with `.pipe()`:

```ts
const query = {
  page: intFromString().pipe(z.int().min(1).max(500)).default(1),
  since: dateFromString().optional(),
  tag: repeated(text({ max: 30 }), 5),
};
```

`text({ max, min })` is a string that is trimmed first and length-checked second, so `'   '` fails a required field. `max` is required. An unbounded string is a storage and CPU cost you did not agree to.

## Responses from other services

```ts
const forecast = z.object({ hourly: z.object({ wave_height: z.array(z.number()) }) });

const result = await parseUpstreamResponse(await fetch(url), forecast);
if (!result.ok) {
  console.error('forecast provider', result.failure); // reason, status, issues
  return problemResponse(result.problem); // 502, no detail about the provider
}
```

Three things differ from inbound parsing:

- **The status is 502.** RFC 9110 section 15.6.3: the server "received an invalid response from an inbound server". The caller did nothing wrong, so a 4xx would be a lie and would stop a well-behaved client from retrying.
- **Schemas are tolerant.** Use `z.object`, which drops unknown keys. You do not control the other side, and a new field in their response must not take your service down. Name only the fields you read.
- **The cause stays on the server.** `failure` carries the reason (`status`, `too-large`, `malformed` or `schema`), the upstream status and the failing pointers for your log. The client gets a generic problem, so it learns nothing about your providers.

`parseUpstreamResponse` reads at most `maxBytes` (default 1 MiB) and refuses a non-2xx status without reading the body. Use `parseUpstreamData` when an SDK has already decoded the response.

## Webhooks

A webhook signature covers the exact bytes sent. Verify first, parse second:

```ts
const raw = await readText(request, { maxBytes: 256 * 1024 });
if (!raw.ok) return problemResponse(raw.problem);
if (!(await signatureMatches(raw.data, request.headers))) {
  return new Response(null, { status: 401 });
}
```

Then parse `raw.data` as JSON and check the event against a schema with `parseUpstreamData`.

Parsing first and re-serialising changes whitespace and key order, and the signature no longer matches. An unverified body is anonymous input, whatever its shape.

## What this package leaves to you

- Authentication, authorisation and rate limiting.
- Business rules that need state. Run them after the parse, and return 409 or 422 yourself.
- Output encoding and SQL parameters.
- Database constraints.
- Form bodies and file uploads. Only JSON bodies are parsed.
