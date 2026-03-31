import { beforeEach, describe, expect, it } from '@jest/globals';
import { env } from 'node:process';

const TEST_SECRET = 'test-jwt-secret-at-least-32-chars-long';

beforeEach(() => {
  env.JWT_SECRET = TEST_SECRET;
});

describe('signGitHubState and verifyGitHubState', () => {
  it('round-trips a valid state payload', async () => {
    const { signGitHubState, verifyGitHubState } = await import('../stateJwt.js');
    const payload = { orgId: '550e8400-e29b-41d4-a716-446655440000', userId: 'user-123' };

    const token = await signGitHubState(payload);
    const result = await verifyGitHubState(token);

    expect(result.orgId).toBe(payload.orgId);
    expect(result.userId).toBe(payload.userId);
  });

  it('rejects a tampered token', async () => {
    const { signGitHubState, verifyGitHubState } = await import('../stateJwt.js');
    const payload = { orgId: '550e8400-e29b-41d4-a716-446655440000', userId: 'user-123' };

    const token = await signGitHubState(payload);
    const tampered = `${token}x`;

    await expect(verifyGitHubState(tampered)).rejects.toThrow();
  });

  it('throws when JWT_SECRET is missing', async () => {
    delete env.JWT_SECRET;
    const { signGitHubState } = await import('../stateJwt.js');
    const payload = { orgId: 'org-1', userId: 'user-1' };

    await expect(signGitHubState(payload)).rejects.toThrow('JWT_SECRET');
  });
});
