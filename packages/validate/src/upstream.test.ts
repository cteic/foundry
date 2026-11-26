import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import { parseUpstreamData, parseUpstreamResponse, type UpstreamResult } from './upstream.ts';

const forecast = z.object({ hourly: z.object({ wave_height: z.array(z.number()) }) });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function failureOf(result: UpstreamResult<unknown>) {
  if (result.ok) throw new Error('expected the upstream parse to fail');
  return result;
}

describe('parseUpstreamResponse', () => {
  it('returns typed data and drops fields the schema does not name', async () => {
    const result = await parseUpstreamResponse(
      json({ hourly: { wave_height: [0.4, 0.6], added_last_week: true }, licence: 'x' }),
      forecast
    );

    expect(result).toEqual({ ok: true, data: { hourly: { wave_height: [0.4, 0.6] } } });
    if (result.ok) {
      expectTypeOf(result.data).toEqualTypeOf<{ hourly: { wave_height: number[] } }>();
    }
  });

  it('reports a shape mismatch as a 502, with the cause kept for the log', async () => {
    const result = failureOf(
      await parseUpstreamResponse(json({ hourly: { wave_height: [0.4, 'calm'] } }), forecast)
    );

    expect(result.problem.status).toBe(502);
    expect(result.problem.type).toMatch(/#upstream-error$/);
    expect(result.problem.errors).toBeUndefined();
    expect(result.failure).toEqual({
      reason: 'schema',
      status: 200,
      issues: [
        {
          pointer: '#/hourly/wave_height/1',
          detail: 'Invalid input: expected number, received string',
        },
      ],
    });
  });

  it('reports a failed upstream status without reading the body', async () => {
    const response = json({ error: 'rate limited' }, 429);
    const result = failureOf(await parseUpstreamResponse(response, forecast));

    expect(result.problem.status).toBe(502);
    expect(result.failure).toEqual({ reason: 'status', status: 429, issues: [] });
    expect(JSON.stringify(result.problem)).not.toContain('rate limited');
  });

  it('reports an HTML error page served with a 200', async () => {
    const result = failureOf(
      await parseUpstreamResponse(new Response('<html>Maintenance</html>'), forecast)
    );

    expect(result.failure.reason).toBe('malformed');
  });

  it('stops reading an oversized response', async () => {
    const big = json({ hourly: { wave_height: Array.from({ length: 5000 }, () => 1.25) } });
    const result = failureOf(await parseUpstreamResponse(big, forecast, { maxBytes: 1024 }));

    expect(result.failure.reason).toBe('too-large');
  });

  it('refuses a response that carries a prototype key', async () => {
    const response = new Response('{"hourly":{"wave_height":[]},"__proto__":{"admin":true}}');

    expect(failureOf(await parseUpstreamResponse(response, forecast)).failure.reason).toBe(
      'malformed'
    );
  });
});

describe('parseUpstreamData', () => {
  it('checks data an SDK already decoded', () => {
    const rows = z.array(z.object({ id: z.uuid() }));

    expect(parseUpstreamData([{ id: 'not-a-uuid' }], rows)).toMatchObject({
      ok: false,
      problem: { status: 502 },
      failure: { reason: 'schema', issues: [{ pointer: '#/0/id' }] },
    });
    expect(parseUpstreamData([], rows)).toEqual({ ok: true, data: [] });
  });
});
