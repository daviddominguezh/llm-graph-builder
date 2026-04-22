import { describe, expect, it } from '@jest/globals';

import {
  type OriginGuardRequest,
  type OriginGuardTenant,
  type TenantLookup,
  enforceWebChannelOrigin,
  matchOrigin,
} from './originGuard.js';

const TENANT: OriginGuardTenant = {
  id: 'tenant-1',
  org_id: 'org-1',
  web_channel_enabled: true,
  web_channel_allowed_origins: ['https://*.live.openflow.build'],
};

function constantLookup(tenant: OriginGuardTenant | null): TenantLookup {
  return async () => await Promise.resolve(tenant);
}

function requestWithOrigin(origin: string | null): OriginGuardRequest {
  const headers: Record<string, string> = origin === null ? {} : { origin };
  return { header: (name: string) => headers[name.toLowerCase()] };
}

describe('matchOrigin', () => {
  it('matches wildcard subdomain', () => {
    expect(matchOrigin('https://foo.live.openflow.build', TENANT.web_channel_allowed_origins)).toBe(true);
  });
  it('rejects wrong host', () => {
    expect(matchOrigin('https://evil.com', TENANT.web_channel_allowed_origins)).toBe(false);
  });
});

interface RunGuardArgs {
  origin: string | null;
  tenant: OriginGuardTenant | null;
  tenantId: string;
  keyOrgId: string;
}

async function runGuard(args: RunGuardArgs): Promise<ReturnType<typeof enforceWebChannelOrigin>> {
  return await enforceWebChannelOrigin({
    req: requestWithOrigin(args.origin),
    lookupTenant: constantLookup(args.tenant),
    tenantId: args.tenantId,
    keyOrgId: args.keyOrgId,
  });
}

describe('enforceWebChannelOrigin happy path', () => {
  it('returns ok when origin matches allowlist', async () => {
    const result = await runGuard({
      origin: 'https://foo.live.openflow.build',
      tenant: TENANT,
      tenantId: 'tenant-1',
      keyOrgId: 'org-1',
    });
    expect(result.ok).toBe(true);
  });
});

describe('enforceWebChannelOrigin tenant-level denials', () => {
  it('403 when tenant not found', async () => {
    const result = await runGuard({
      origin: 'https://foo.live.openflow.build',
      tenant: null,
      tenantId: 'tenant-missing',
      keyOrgId: 'org-1',
    });
    expect(result.ok).toBe(false);
  });
  it('403 when tenant org mismatches key org', async () => {
    const result = await runGuard({
      origin: 'https://foo.live.openflow.build',
      tenant: TENANT,
      tenantId: 'tenant-1',
      keyOrgId: 'other-org',
    });
    expect(result.ok).toBe(false);
  });
  it('403 when web channel disabled', async () => {
    const result = await runGuard({
      origin: 'https://foo.live.openflow.build',
      tenant: { ...TENANT, web_channel_enabled: false },
      tenantId: 'tenant-1',
      keyOrgId: 'org-1',
    });
    expect(result.ok).toBe(false);
  });
});

describe('enforceWebChannelOrigin origin-level denials', () => {
  it('403 when origin header missing', async () => {
    const result = await runGuard({
      origin: null,
      tenant: TENANT,
      tenantId: 'tenant-1',
      keyOrgId: 'org-1',
    });
    expect(result.ok).toBe(false);
  });
  it('403 when origin not in allowlist', async () => {
    const result = await runGuard({
      origin: 'https://evil.com',
      tenant: TENANT,
      tenantId: 'tenant-1',
      keyOrgId: 'org-1',
    });
    expect(result.ok).toBe(false);
  });
  it('400 when tenantId is empty', async () => {
    const result = await runGuard({
      origin: 'https://foo.live.openflow.build',
      tenant: TENANT,
      tenantId: '',
      keyOrgId: 'org-1',
    });
    expect(result.ok).toBe(false);
  });
});
