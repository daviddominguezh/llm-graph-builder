import { beforeEach, describe, expect, it, jest } from '@jest/globals';

interface RpcResult {
  error: { message: string } | null;
}

const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<RpcResult>>();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ rpc: mockRpc }),
}));

const { createClient } = await import('@supabase/supabase-js');
const { mirrorDefaultTenantAvatar, mirrorDefaultTenantIdentity } = await import('./tenantQueries.js');

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'anon-key';

describe('default-tenant mirror queries', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('mirrorDefaultTenantIdentity calls set_default_tenant_identity', async () => {
    mockRpc.mockResolvedValue({ error: null });
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { error } = await mirrorDefaultTenantIdentity(supabase, 'o1', {
      name: 'Acme',
      slug: 'acme',
      avatarUrl: null,
    });

    expect(error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('set_default_tenant_identity', {
      p_org_id: 'o1',
      p_name: 'Acme',
      p_slug: 'acme',
      p_avatar_url: null,
    });
  });

  it('mirrorDefaultTenantAvatar surfaces the RPC error message', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'boom' } });
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { error } = await mirrorDefaultTenantAvatar(supabase, 'o1', 'https://x/a');

    expect(error).toBe('boom');
  });
});
