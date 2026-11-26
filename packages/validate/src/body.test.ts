import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import { isJsonContentType, parseJsonBody, readText } from './body.ts';
import type { ParseResult, Problem } from './problem.ts';

const URL_UNDER_TEST = 'https://api.test/things';

function post(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request(URL_UNDER_TEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

function problemOf(result: ParseResult<unknown>): Problem {
  if (result.ok) throw new Error('expected the parse to fail');
  return result.problem;
}

const signup = {
  email: z.email(),
  age: z.int().min(18),
};

describe('parseJsonBody', () => {
  it('returns typed data for a valid body', async () => {
    const result = await parseJsonBody(post('{"email":"a@example.com","age":30}'), signup);

    expect(result).toEqual({ ok: true, data: { email: 'a@example.com', age: 30 } });
    if (result.ok) {
      expectTypeOf(result.data).toEqualTypeOf<{ email: string; age: number }>();
    }
  });

  it('infers the output type of a full schema', async () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const result = await parseJsonBody(post('{"tags":["a"],"extra":1}'), schema);

    expect(result).toEqual({ ok: true, data: { tags: ['a'] } });
    if (result.ok) expectTypeOf(result.data).toEqualTypeOf<{ tags: string[] }>();
  });

  it('runs async refinements', async () => {
    const schema = z.strictObject({
      name: z.string().refine((value) => Promise.resolve(value !== 'taken'), 'Already in use'),
    });
    const problem = problemOf(await parseJsonBody(post('{"name":"taken"}'), schema));

    expect(problem.errors).toEqual([{ in: 'body', pointer: '#/name', detail: 'Already in use' }]);
  });

  it.each([
    ['text/plain'],
    ['application/x-www-form-urlencoded'],
    ['multipart/form-data; boundary=x'],
    ['application/jsonp'],
  ])('refuses content type %s with 415', async (contentType) => {
    const request = post('{"email":"a@example.com","age":30}', { 'Content-Type': contentType });
    const problem = problemOf(await parseJsonBody(request, signup));

    expect(problem.status).toBe(415);
    expect(problem.type).toMatch(/#unsupported-media-type$/);
  });

  it('refuses a body with no content type', async () => {
    const request = new Request(URL_UNDER_TEST, {
      method: 'POST',
      body: new TextEncoder().encode('{"email":"a@example.com","age":30}'),
    });

    expect(problemOf(await parseJsonBody(request, signup)).status).toBe(415);
  });

  it('refuses a compressed body with 415', async () => {
    const request = post('{"email":"a@example.com","age":30}', { 'Content-Encoding': 'gzip' });

    expect(problemOf(await parseJsonBody(request, signup)).status).toBe(415);
  });

  it.each([
    ['not json', '{"email": '],
    ['a trailing comma', '{"email":"a@example.com",}'],
    ['single quotes', "{'email':'a@example.com'}"],
  ])('answers 400 for %s and does not echo the body', async (_label, body) => {
    const problem = problemOf(await parseJsonBody(post(body), signup));

    expect(problem.status).toBe(400);
    expect(problem.type).toMatch(/#malformed-body$/);
    expect(problem.detail).toBe('The request body is not valid JSON.');
    expect(JSON.stringify(problem)).not.toContain('a@example.com');
  });

  it('answers 400 for an empty body', async () => {
    const problem = problemOf(await parseJsonBody(post(''), signup));

    expect(problem).toMatchObject({ status: 400, detail: 'The request body is empty.' });
  });

  it('answers 400 for bytes that are not UTF-8', async () => {
    const problem = problemOf(
      await parseJsonBody(post(new Uint8Array([0x7b, 0xff, 0x7d])), signup)
    );

    expect(problem).toMatchObject({ status: 400, detail: 'The request body is not valid UTF-8.' });
  });

  it('refuses a body over the cap by its Content-Length', async () => {
    const request = post('{"email":"a@example.com","age":30}', { 'Content-Length': '999999' });
    const problem = problemOf(await parseJsonBody(request, signup, { maxBytes: 1024 }));

    expect(problem.status).toBe(413);
    expect(problem.detail).toBe('The request body must be at most 1024 bytes.');
  });

  it('refuses a streamed body over the cap when no length is declared', async () => {
    let pulled = 0;
    const chunk = new TextEncoder().encode('"'.padEnd(1024, 'a'));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    const request = new Request(URL_UNDER_TEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      // @ts-expect-error Node needs `duplex` for a stream body and the DOM types omit it.
      duplex: 'half',
    });
    const problem = problemOf(await parseJsonBody(request, signup, { maxBytes: 4096 }));

    expect(problem.status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });

  it('counts bytes, not characters', async () => {
    const body = JSON.stringify({ name: 'é'.repeat(60) });
    expect(body.length).toBeLessThan(100);

    const problem = problemOf(
      await parseJsonBody(post(body), { name: z.string() }, { maxBytes: 100 })
    );

    expect(problem.status).toBe(413);
  });

  it('refuses deep nesting before parsing it', async () => {
    const body = '['.repeat(100_000) + ']'.repeat(100_000);
    const problem = problemOf(
      await parseJsonBody(post(body), z.unknown(), { maxBytes: 1_000_000 })
    );

    expect(problem).toMatchObject({
      status: 400,
      detail: 'The request body is nested too deeply.',
    });
  });

  it('rejects unknown keys by default and names each one', async () => {
    const body = '{"email":"a@example.com","age":30,"role":"admin","isAdmin":true}';
    const problem = problemOf(await parseJsonBody(post(body), signup));

    expect(problem.status).toBe(422);
    expect(problem.type).toMatch(/#validation-error$/);
    expect(problem.errors).toEqual([
      { in: 'body', pointer: '#/role', detail: 'Unknown field' },
      { in: 'body', pointer: '#/isAdmin', detail: 'Unknown field' },
    ]);
  });

  it('reports every bad field with its path', async () => {
    const schema = {
      email: z.email(),
      profile: z.strictObject({ colour: z.enum(['green', 'red']), pets: z.array(z.string()) }),
    };
    const body = '{"email":"nope","profile":{"colour":"blue","pets":["cat",7]}}';
    const problem = problemOf(await parseJsonBody(post(body), schema));

    expect(problem.status).toBe(422);
    expect(problem.errors).toEqual([
      { in: 'body', pointer: '#/email', detail: 'Invalid email address' },
      {
        in: 'body',
        pointer: '#/profile/colour',
        detail: 'Invalid option: expected one of "green"|"red"',
      },
      {
        in: 'body',
        pointer: '#/profile/pets/1',
        detail: 'Invalid input: expected string, received number',
      },
    ]);
  });

  it('says Required for a missing field', async () => {
    const problem = problemOf(await parseJsonBody(post('{"email":"a@example.com"}'), signup));

    expect(problem.errors).toEqual([{ in: 'body', pointer: '#/age', detail: 'Required' }]);
  });

  it.each([
    ['a string for a number', '{"email":"a@example.com","age":"30"}'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a bare string', '"hello"'],
  ])('does not coerce or accept %s', async (_label, body) => {
    expect(problemOf(await parseJsonBody(post(body), signup)).status).toBe(422);
  });

  it.each([
    ['__proto__ at the top', '{"email":"a@example.com","age":30,"__proto__":{"admin":true}}'],
    ['__proto__ nested', '{"a":{"b":[{"__proto__":{"admin":true}}]}}'],
    ['constructor.prototype', '{"constructor":{"prototype":{"admin":true}}}'],
  ])('rejects %s even under a schema that accepts anything', async (_label, body) => {
    const problem = problemOf(await parseJsonBody(post(body), z.unknown()));

    expect(problem.status).toBe(422);
    expect(problem.errors?.[0]?.detail).toBe('This key is not allowed');
    expect({}).not.toHaveProperty('admin');
  });

  it('allows a field that is only named constructor', async () => {
    const result = await parseJsonBody(post('{"constructor":"Wren"}'), z.unknown());

    expect(result.ok).toBe(true);
  });

  it('never returns the rejected value', async () => {
    const schema = { password: z.string().min(12), token: z.uuid(), pin: z.int() };
    const body = '{"password":"hunter2","token":"sk_live_abc123","pin":"4929"}';
    const problem = problemOf(await parseJsonBody(post(body), schema));
    const sent = JSON.stringify(problem);

    expect(problem.errors).toHaveLength(3);
    expect(sent).not.toContain('hunter2');
    expect(sent).not.toContain('sk_live_abc123');
    expect(sent).not.toContain('4929');
  });

  it('removes the value from a custom message that includes it', async () => {
    const schema = {
      apiKey: z
        .string()
        .refine(() => false, { error: (issue) => `Bad key ${String(issue.input)}` }),
    };
    const problem = problemOf(await parseJsonBody(post('{"apiKey":"sk_live_abc123"}'), schema));

    expect(problem.errors).toEqual([
      { in: 'body', pointer: '#/apiKey', detail: 'Bad key [redacted]' },
    ]);
  });

  it('caps the number of errors it reports', async () => {
    const body = JSON.stringify(
      Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${String(i)}`, i]))
    );
    const problem = problemOf(await parseJsonBody(post(body), {}));

    expect(problem.errors).toHaveLength(20);
  });
});

describe('readText', () => {
  it('returns the exact body text for signature checks', async () => {
    const raw = '{ "id": "evt_1",  "spacing": "kept" }';
    const result = await readText(post(raw, { 'Content-Type': 'text/plain' }));

    expect(result).toEqual({ ok: true, data: raw });
  });

  it('applies the size cap', async () => {
    const result = await readText(post('x'.repeat(200)), { maxBytes: 100 });

    expect(problemOf(result).status).toBe(413);
  });
});

describe('isJsonContentType', () => {
  it.each([
    ['application/json', true],
    ['Application/JSON; charset=utf-8', true],
    ['application/merge-patch+json', true],
    ['application/problem+json', true],
    ['text/json', false],
    ['application/json-seq', false],
    ['', false],
    [null, false],
  ])('%s is %s', (header, expected) => {
    expect(isJsonContentType(header)).toBe(expected);
  });
});
