import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

interface ValidatedKey {
  id: string;
  orgId: string;
}

const mockValidateExecutionKey =
  jest.fn<(supabase: SupabaseClient, hash: string) => Promise<ValidatedKey | null>>();
const mockCreateServiceClient = jest.fn<() => SupabaseClient>();
const mockUpdateKeyLastUsed = jest.fn<(supabase: SupabaseClient, keyId: string) => Promise<void>>();

jest.unstable_mockModule('../../db/queries/executionAuthQueries.js', () => ({
  validateExecutionKey: mockValidateExecutionKey,
  createServiceClient: mockCreateServiceClient,
  updateKeyLastUsed: mockUpdateKeyLastUsed,
}));

const { authenticateMcpKey } = await import('../auth.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authenticateMcpKey', () => {
  it('returns ServiceContext when key is valid', async () => {
    const fakeSupabase = mockCreateServiceClient();
    mockValidateExecutionKey.mockResolvedValue({ id: 'key-1', orgId: 'org-1' });

    const result = await authenticateMcpKey('Bearer valid-token');

    expect(result).toEqual({ supabase: fakeSupabase, orgId: 'org-1', keyId: 'key-1' });
  });

  it('throws when authorization header is undefined', async () => {
    await expect(authenticateMcpKey(undefined)).rejects.toThrow('Missing or malformed Authorization header');
  });

  it('throws when token has no Bearer prefix', async () => {
    await expect(authenticateMcpKey('Basic some-token')).rejects.toThrow(
      'Missing or malformed Authorization header'
    );
  });

  it('throws when key hash is not found in DB', async () => {
    mockValidateExecutionKey.mockResolvedValue(null);

    await expect(authenticateMcpKey('Bearer unknown-token')).rejects.toThrow(
      'Invalid or expired execution key'
    );
  });

  it('throws when key is expired (validateExecutionKey returns null)', async () => {
    mockValidateExecutionKey.mockResolvedValue(null);

    await expect(authenticateMcpKey('Bearer expired-token')).rejects.toThrow(
      'Invalid or expired execution key'
    );
  });
});
