import { describe, expect, it } from 'vitest';

import { sanitizePath } from './sanitize-path.js';

describe('sanitizePath', () => {
  it.each([
    ['/', '/'],
    ['/leagues', '/leagues'],
    ['/rivals/12345', '/rivals/:id'],
    ['/h2h/99/vs/101', '/h2h/:id/vs/:id'],
    ['/users/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b', '/users/:id'],
    ['/invite/pat@example.com', '/invite/:email'],
    ['/invite/pat%40example.com', '/invite/:email'],
    ['/reset/Zm9vYmFyYmF6cXV4cXV1eHF1dXhxdXV4cXV1eA', '/reset/:param'],
    ['/rivals/12345?tab=h2h#top', '/rivals/:id'],
    ['/season/2026-27', '/season/2026-27'],
  ])('turns %s into %s', (input, expected) => {
    expect(sanitizePath(input)).toBe(expected);
  });

  it('masks segments that match an app pattern', () => {
    const evm = /^0x[0-9a-fA-F]{16,}$/;
    expect(sanitizePath('/wallet/eth/0xabcdef0123456789ab', { patterns: [evm] })).toBe(
      '/wallet/eth/:param'
    );
  });

  it('leaves a malformed escape alone instead of throwing', () => {
    expect(sanitizePath('/search/%E0%A4%A')).toBe('/search/%E0%A4%A');
  });
});
