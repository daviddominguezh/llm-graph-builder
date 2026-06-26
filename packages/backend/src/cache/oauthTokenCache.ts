import type { OAuthTokenBundle } from '@daviddh/llm-graph-runner';

const SAFETY_MARGIN_MS = 60_000;
const MS_PER_S = 1000;
const ZERO = 0;

export function oauthTokenKey(orgId: string, providerId: string): string {
  return `oauth:v1:${orgId}:${providerId}`;
}

export function computeTtlSeconds(expiresAt: number, now: number): number {
  const ttlMs = expiresAt - now - SAFETY_MARGIN_MS;
  return Math.max(ZERO, Math.floor(ttlMs / MS_PER_S));
}

export function isFresh(token: OAuthTokenBundle, now: number): boolean {
  return token.expiresAt - now > SAFETY_MARGIN_MS;
}
