import { describe, expect, it } from '@jest/globals';

import { computeTtlSeconds, isFresh, oauthTokenKey } from '../oauthTokenCache.js';

const NOW = 1_000_000;
const FIVE_MIN_MS = 5 * 60 * 1000;
const FOUR_MIN_S = 4 * 60;
const THIRTY_S_MS = 30 * 1000;

describe('oauthTokenCache helpers', () => {
  it('builds the canonical key', () => {
    expect(oauthTokenKey('org-1', 'calendar')).toBe('oauth:v1:org-1:calendar');
  });

  it('computeTtlSeconds returns expiresAt - now - 60s, floored', () => {
    expect(computeTtlSeconds(NOW + FIVE_MIN_MS, NOW)).toBe(FOUR_MIN_S);
  });

  it('computeTtlSeconds returns 0 when within safety margin', () => {
    expect(computeTtlSeconds(NOW + THIRTY_S_MS, NOW)).toBe(0);
  });

  it('isFresh rejects token past expiresAt - safety margin', () => {
    expect(isFresh({ accessToken: 't', expiresAt: NOW + THIRTY_S_MS, tokenIssuedAt: NOW }, NOW)).toBe(false);
    expect(isFresh({ accessToken: 't', expiresAt: NOW + FIVE_MIN_MS, tokenIssuedAt: NOW }, NOW)).toBe(true);
  });
});
