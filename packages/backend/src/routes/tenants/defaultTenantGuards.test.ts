import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

const HTTP_FORBIDDEN = 403;

interface Captured {
  statusCode: number | null;
  body: unknown;
}

interface Responder {
  status: (code: number) => { json: (body: unknown) => unknown };
}

function makeRes(): { res: Responder; captured: Captured } {
  const captured: Captured = { statusCode: null, body: null };
  const res: Responder = {
    status: (code: number) => {
      captured.statusCode = code;
      return {
        json: (body: unknown) => {
          captured.body = body;
          return body;
        },
      };
    },
  };
  return { res, captured };
}

jest.unstable_mockModule('../../db/queries/tenantQueries.js', () => ({
  getTenantById: jest.fn(
    async () =>
      await Promise.resolve({
        result: { id: 't1', is_default: true, name: 'Acme', org_id: 'o1', slug: 'acme' },
        error: null,
      })
  ),
}));

const { assertNotDefaultTenant } = await import('./defaultTenantGuards.js');

describe('assertNotDefaultTenant', () => {
  it('responds 403 with the given code when the tenant is default', async () => {
    const { res, captured } = makeRes();
    const supabase = jest.fn<() => SupabaseClient>()();
    const blocked = await assertNotDefaultTenant(supabase, 't1', res, 'default_tenant_locked');
    expect(blocked).toBe(true);
    expect(captured.statusCode).toBe(HTTP_FORBIDDEN);
    expect(captured.body).toEqual({ error: 'default_tenant_locked' });
  });
});
