import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import { intFromString } from './from-string.ts';
import { parseParams } from './params.ts';

const route = { leagueId: intFromString().pipe(z.int().positive()) };

describe('parseParams', () => {
  it('coerces a numeric path segment', () => {
    const result = parseParams({ leagueId: '314' }, route);

    expect(result).toEqual({ ok: true, data: { leagueId: 314 } });
    if (result.ok) expectTypeOf(result.data).toEqualTypeOf<{ leagueId: number }>();
  });

  it.each(['abc', '-1', '0', '1.5', '../etc/passwd', ''])('answers 400 for %j', (leagueId) => {
    const result = parseParams({ leagueId }, route);

    expect(result).toMatchObject({
      ok: false,
      problem: { status: 400, errors: [{ in: 'path', pointer: '#/leagueId' }] },
    });
  });

  it('reports a missing parameter as required', () => {
    const result = parseParams({ leagueId: undefined }, route);

    expect(result).toMatchObject({
      ok: false,
      problem: { errors: [{ in: 'path', pointer: '#/leagueId', detail: 'Required' }] },
    });
  });

  it('accepts a catch-all segment list under a full schema', () => {
    const schema = z.strictObject({ path: z.array(z.string().regex(/^[\w-]+$/)).max(4) });

    expect(parseParams({ path: ['v2', 'accounts'] }, schema)).toEqual({
      ok: true,
      data: { path: ['v2', 'accounts'] },
    });
    expect(parseParams({ path: ['v2', '..'] }, schema).ok).toBe(false);
  });
});
