import { describe, expect, it, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

import { mirrorDefaultTenantAvatar, mirrorDefaultTenantIdentity } from './tenantQueries.js';

const HTTP_OK = 200;
const HTTP_ERROR = 500;
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'anon-key';

describe('default-tenant mirror queries', () => {
  it('mirrorDefaultTenantIdentity calls set_default_tenant_identity', async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const rpc = jest
      .spyOn(supabase, 'rpc')
      .mockResolvedValue({ data: null, error: null, count: null, status: HTTP_OK, statusText: 'OK' });

    const { error } = await mirrorDefaultTenantIdentity(supabase, 'o1', {
      name: 'Acme',
      slug: 'acme',
      avatarUrl: null,
    });
    expect(error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('set_default_tenant_identity', {
      p_org_id: 'o1',
      p_name: 'Acme',
      p_slug: 'acme',
      p_avatar_url: null,
    });
  });

  it('mirrorDefaultTenantAvatar surfaces the RPC error message', async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    jest.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { message: 'boom', details: '', hint: '', code: '', name: 'PostgrestError' },
      count: null,
      status: HTTP_ERROR,
      statusText: 'Error',
    });

    const { error } = await mirrorDefaultTenantAvatar(supabase, 'o1', 'https://x/a');
    expect(error).toBe('boom');
  });
});
