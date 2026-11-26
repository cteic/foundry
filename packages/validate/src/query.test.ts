import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import {
  booleanFromString,
  dateFromString,
  intFromString,
  numberFromString,
  repeated,
  text,
} from './from-string.ts';
import type { ParseResult, Problem } from './problem.ts';
import { parseQuery, queryRecord } from './query.ts';

function url(query: string): URL {
  return new URL(`https://api.test/search?${query}`);
}

function problemOf(result: ParseResult<unknown>): Problem {
  if (result.ok) throw new Error('expected the parse to fail');
  return result.problem;
}

const search = {
  q: text({ max: 50 }),
  page: intFromString().pipe(z.int().min(1).max(100)).default(1),
  exact: booleanFromString().optional(),
};

describe('parseQuery', () => {
  it('coerces strings to the types the schema names', () => {
    const result = parseQuery(url('q=%20waves%20&page=3&exact=true'), search);

    expect(result).toEqual({ ok: true, data: { q: 'waves', page: 3, exact: true } });
    if (result.ok) {
      expectTypeOf(result.data).toEqualTypeOf<{
        q: string;
        page: number;
        exact?: boolean | undefined;
      }>();
    }
  });

  it('accepts a Request, a URL or URLSearchParams', () => {
    const fromRequest = parseQuery(new Request(url('q=a')), search);
    const fromParams = parseQuery(new URLSearchParams('q=a'), search);

    expect(fromRequest).toEqual({ ok: true, data: { q: 'a', page: 1 } });
    expect(fromParams).toEqual(fromRequest);
  });

  it('answers 400 with the field path for a bad value', () => {
    const problem = problemOf(parseQuery(url('q=a&page=abc'), search));

    expect(problem.status).toBe(400);
    expect(problem.type).toMatch(/#validation-error$/);
    expect(problem.errors).toEqual([
      { in: 'query', pointer: '#/page', detail: 'Expected a whole number' },
    ]);
  });

  it('rejects a key sent twice when the schema expects one value', () => {
    const problem = problemOf(parseQuery(url('q=a&page=1&page=2'), search));

    expect(problem.errors).toEqual([
      { in: 'query', pointer: '#/page', detail: 'Invalid input: expected string, received array' },
    ]);
  });

  it('accepts a repeated key where the schema asks for a list', () => {
    const schema = { tag: repeated(text({ max: 10 }), 3) };

    expect(parseQuery(url('tag=a&tag=b'), schema)).toEqual({ ok: true, data: { tag: ['a', 'b'] } });
    expect(parseQuery(url('tag=a'), schema)).toEqual({ ok: true, data: { tag: ['a'] } });
    expect(parseQuery(url(''), schema)).toEqual({ ok: true, data: { tag: [] } });
    expect(problemOf(parseQuery(url('tag=a&tag=b&tag=c&tag=d'), schema)).status).toBe(400);
  });

  it('rejects unknown keys by default', () => {
    const problem = problemOf(parseQuery(url('q=a&debug=1'), search));

    expect(problem.errors).toEqual([{ in: 'query', pointer: '#/debug', detail: 'Unknown field' }]);
  });

  it('treats __proto__ as one more unknown key', () => {
    const problem = problemOf(parseQuery(url('q=a&__proto__=x&__proto__[admin]=1'), search));

    expect(problem.errors?.map((error) => error.pointer)).toEqual([
      '#/__proto__',
      '#/__proto__%5Badmin%5D',
    ]);
    expect(Object.getPrototypeOf(queryRecord(url('__proto__=x')))).toBe(Object.prototype);
  });

  it('rejects text that is blank after trimming', () => {
    expect(problemOf(parseQuery(url('q=%20%20'), search)).errors?.[0]?.pointer).toBe('#/q');
  });

  it('never returns the rejected value', () => {
    const problem = problemOf(parseQuery(url('q=a&page=sk_live_abc123'), search));

    expect(JSON.stringify(problem)).not.toContain('sk_live_abc123');
  });
});

describe('string coercion', () => {
  it.each([
    '',
    ' ',
    ' 7',
    '7 ',
    '0x10',
    '1e3',
    '1.5',
    '+7',
    '07',
    'NaN',
    'Infinity',
    '9'.repeat(17),
  ])('intFromString rejects %j', (value) => {
    expect(intFromString().safeParse(value).success).toBe(false);
  });

  it.each([
    ['0', 0],
    ['-12', -12],
    ['900719925474099', 900_719_925_474_099],
  ])('intFromString reads %j', (value, expected) => {
    expect(intFromString().parse(value)).toBe(expected);
  });

  it.each(['', '.5', '5.', '1e3', '1,5', 'Infinity', '--1'])(
    'numberFromString rejects %j',
    (value) => {
      expect(numberFromString().safeParse(value).success).toBe(false);
    }
  );

  it('numberFromString reads a plain decimal', () => {
    expect(numberFromString().parse('-0.25')).toBe(-0.25);
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('booleanFromString reads %j', (value, expected) => {
    expect(booleanFromString().parse(value)).toBe(expected);
  });

  it.each(['', 'yes', 'on', 'null', '2'])('booleanFromString rejects %j', (value) => {
    expect(booleanFromString().safeParse(value).success).toBe(false);
  });

  it('dateFromString reads ISO 8601 only', () => {
    expect(dateFromString().parse('2026-03-07').toISOString()).toBe('2026-03-07T00:00:00.000Z');
    expect(dateFromString().parse('2026-03-07T09:30:00+01:00').toISOString()).toBe(
      '2026-03-07T08:30:00.000Z'
    );
  });

  it.each(['1', '2026-02-30', '2026-13-01', 'March 7, 2026', '07/03/2026', '2026-03-07T09:30:00'])(
    'dateFromString rejects %j',
    (value) => {
      expect(dateFromString().safeParse(value).success).toBe(false);
    }
  );

  it('text enforces its limits after trimming', () => {
    expect(text({ max: 3 }).parse('  abc  ')).toBe('abc');
    expect(text({ max: 3 }).safeParse('abcd').success).toBe(false);
    expect(text({ max: 3, min: 0 }).parse('   ')).toBe('');
  });
});
