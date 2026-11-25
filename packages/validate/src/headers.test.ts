import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import { parseHeaders } from './headers.ts';

function request(headers: Record<string, string>): Request {
  return new Request('https://api.test/hook', { method: 'POST', headers });
}

const signed = { 'x-signature': z.string().regex(/^[0-9a-f]{64}$/, 'Expected 64 hex characters') };

describe('parseHeaders', () => {
  it('reads the named headers whatever their case and ignores the rest', () => {
    const signature = 'ab'.repeat(32);
    const result = parseHeaders(
      request({ 'X-Signature': signature, 'User-Agent': 'curl' }),
      signed
    );

    expect(result).toEqual({ ok: true, data: { 'x-signature': signature } });
    if (result.ok) expectTypeOf(result.data).toEqualTypeOf<{ 'x-signature': string }>();
  });

  it('answers 400 for a missing header', () => {
    expect(parseHeaders(request({}), signed)).toMatchObject({
      ok: false,
      problem: {
        status: 400,
        errors: [{ in: 'header', pointer: '#/x-signature', detail: 'Required' }],
      },
    });
  });

  it('never returns the rejected header value', () => {
    const result = parseHeaders(new Headers({ 'x-signature': 'Bearer sk_live_abc123' }), signed);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('sk_live_abc123');
  });

  it('gives a full schema every header, lower-cased', () => {
    const schema = z.looseObject({ 'idempotency-key': z.uuid() });
    const key = '0190c1e2-7b3a-7c4e-8f1a-2b3c4d5e6f70';
    const result = parseHeaders(request({ 'Idempotency-Key': key, Accept: '*/*' }), schema);

    expect(result).toMatchObject({ ok: true, data: { 'idempotency-key': key, accept: '*/*' } });
  });
});
