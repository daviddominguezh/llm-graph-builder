/**
 * Layer-1 literal-host pre-check (web edge, defense-in-depth).
 *
 * Mirrors the backend egress guard's blocked/allowed literal + scheme cases,
 * but returns a boolean. Hostnames (e.g. `example.com`) are NOT blocked here —
 * the authoritative DNS-resolving guard lives backend-side.
 */
import { describe, expect, it } from '@jest/globals';

import { isLiteralBlocked } from '../egressPrecheck';

describe('isLiteralBlocked', () => {
  it.each([
    'http://127.0.0.1/x',
    'http://169.254.169.254/',
    'http://10.0.0.1/',
    'file://x',
    'http://localhost/',
    'http://[::1]/',
    'http://[::ffff:10.0.0.1]/',
  ])('blocks %s', (url) => {
    expect(isLiteralBlocked(url)).toBe(true);
  });

  it.each(['https://1.1.1.1/', 'https://example.com/'])('allows %s', (url) => {
    expect(isLiteralBlocked(url)).toBe(false);
  });
});
