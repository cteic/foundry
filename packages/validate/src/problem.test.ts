import { describe, expect, it } from 'vitest';

import { toPointer } from './issues.ts';
import { exceedsDepth } from './json.ts';
import { InputLocation, problemResponse, validationError } from './problem.ts';

describe('problemResponse', () => {
  it('sends RFC 9457 problem details with the status from the problem', async () => {
    const problem = validationError(
      [{ in: InputLocation.body, pointer: '#/age', detail: 'Required' }],
      InputLocation.body
    );
    const response = problemResponse(problem, {
      headers: { 'Access-Control-Allow-Origin': 'https://app.test' },
    });

    expect(response.status).toBe(422);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    await expect(response.json()).resolves.toEqual({
      type: 'https://github.com/cteic/foundry/blob/main/packages/validate/README.md#validation-error',
      title: 'Request validation failed',
      status: 422,
      detail: 'The request body is not valid.',
      errors: [{ in: 'body', pointer: '#/age', detail: 'Required' }],
    });
  });

  it('uses 400 for input outside the body', () => {
    expect(validationError([], InputLocation.query).status).toBe(400);
    expect(validationError([], InputLocation.path).status).toBe(400);
    expect(validationError([], InputLocation.header).status).toBe(400);
  });
});

describe('toPointer', () => {
  it.each([
    [[], '#'],
    [['profile', 'pets', 1], '#/profile/pets/1'],
    [['a/b', 'c~d'], '#/a~1b/c~0d'],
    [['two words', 'é'], '#/two%20words/%C3%A9'],
  ])('%j becomes %s', (path, pointer) => {
    expect(toPointer(path)).toBe(pointer);
  });

  it('shortens a very long key', () => {
    expect(toPointer(['k'.repeat(5000)]).length).toBeLessThan(80);
  });
});

describe('exceedsDepth', () => {
  it('counts only brackets outside strings', () => {
    expect(exceedsDepth('{"a":"[[[[[[","b":"\\"]]]{{{"}', 1)).toBe(false);
    expect(exceedsDepth('{"a":{"b":[1]}}', 3)).toBe(false);
    expect(exceedsDepth('{"a":{"b":[1]}}', 2)).toBe(true);
  });
});
