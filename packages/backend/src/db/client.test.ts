import { afterEach, describe, expect, it } from '@jest/globals';

import { serviceSupabase } from './client.js';

describe('serviceSupabase', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    expect(() => serviceSupabase()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/v);
  });

  it('returns a client when env is set', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    const client = serviceSupabase();
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });
});
