import { describe, expect, it } from '@jest/globals';

import { computeTtlSeconds, isFresh, oauthTokenKey } from '../oauthTokenCache.js';

const NOW = 1_000_000;
const SECONDS_PER_MIN = 60;
const MS_PER_SECOND = 1000;
const FIVE_MINUTES = 5;
const FOUR_MINUTES = 4;
const THIRTY_SECONDS = 30;
const FIVE_MIN_MS = FIVE_MINUTES * SECONDS_PER_MIN * MS_PER_SECOND;
const FOUR_MIN_S = FOUR_MINUTES * SECONDS_PER_MIN;
const THIRTY_S_MS = THIRTY_SECONDS * MS_PER_SECOND;
const ZERO = 0;

describe('oauthTokenCache helpers', () => {
  it('builds the canonical key', () => {
    expect(oauthTokenKey('org-1', 'calendar')).toBe('oauth:v1:org-1:calendar');
  });

  it('computeTtlSeconds returns expiresAt - now - 60s, floored', () => {
    expect(computeTtlSeconds(NOW + FIVE_MIN_MS, NOW)).toBe(FOUR_MIN_S);
  });

  it('computeTtlSeconds returns 0 when within safety margin', () => {
    expect(computeTtlSeconds(NOW + THIRTY_S_MS, NOW)).toBe(ZERO);
  });

  it('isFresh rejects token past expiresAt - safety margin', () => {
    expect(isFresh({ accessToken: 't', expiresAt: NOW + THIRTY_S_MS, tokenIssuedAt: NOW }, NOW)).toBe(false);
    expect(isFresh({ accessToken: 't', expiresAt: NOW + FIVE_MIN_MS, tokenIssuedAt: NOW }, NOW)).toBe(true);
  });
});
