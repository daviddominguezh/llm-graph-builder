import { describe, expect, it } from '@jest/globals';

import {
  type OriginGuardRequest,
  type OriginGuardTenantWebConfig,
  type WebConfigLookup,
  enforceWebChannelOrigin,
  matchOrigin,
} from './originGuard.js';

const CONFIG: OriginGuardTenantWebConfig = {
  web_channel_enabled: true,
  web_channel_allowed_origins: ['https://*.live.openflow.build'],
};

function constantLookup(config: OriginGuardTenantWebConfig | null): WebConfigLookup {
  return async () => await Promise.resolve(config);
}

function requestWithOrigin(origin: string | null): OriginGuardRequest {
  const headers: Record<string, string> = origin === null ? {} : { origin };
  return { header: (name: string) => headers[name.toLowerCase()] };
}

describe('matchOrigin', () => {
  it('matches wildcard subdomain', () => {
    expect(matchOrigin('https://foo.live.openflow.build', CONFIG.web_channel_allowed_origins)).toBe(true);
  });
  it('rejects wrong host', () => {
    expect(matchOrigin('https://evil.com', CONFIG.web_channel_allowed_origins)).toBe(false);
  });
});

interface RunGuardArgs {
  origin: string | null;
  config: OriginGuardTenantWebConfig | null;
  tenantId: string;
}

async function runGuard(args: RunGuardArgs): Promise<ReturnType<typeof enforceWebChannelOrigin>> {
  return await enforceWebChannelOrigin({
    req: requestWithOrigin(args.origin),
    lookupWebConfig: constantLookup(args.config),
    tenantId: args.tenantId,
  });
}

describe('enforceWebChannelOrigin happy path', () => {
  it('returns ok when origin matches allowlist', async () => {
    const result = await runGuard({
      origin: 'https://foo.live.openflow.build',
      config: CONFIG,
      tenantId: 'tenant-1',
    });
    expect(result.ok).toBe(true);
  });
});

describe('enforceWebChannelOrigin tenant-level denials', () => {
  it('403 when tenant not found', async () => {
    const result = await runGuard({
      origin: 'https://foo.live.openflow.build',
      config: null,
      tenantId: 'tenant-missing',
    });
    expect(result.ok).toBe(false);
  });
  it('403 when web channel disabled', async () => {
    const result = await runGuard({
      origin: 'https://foo.live.openflow.build',
      config: { ...CONFIG, web_channel_enabled: false },
      tenantId: 'tenant-1',
    });
    expect(result.ok).toBe(false);
  });
});

describe('enforceWebChannelOrigin origin-level denials', () => {
  it('403 when origin header missing', async () => {
    const result = await runGuard({ origin: null, config: CONFIG, tenantId: 'tenant-1' });
    expect(result.ok).toBe(false);
  });
  it('403 when origin not in allowlist', async () => {
    const result = await runGuard({
      origin: 'https://evil.com',
      config: CONFIG,
      tenantId: 'tenant-1',
    });
    expect(result.ok).toBe(false);
  });
  it('400 when tenantId is empty', async () => {
    const result = await runGuard({
      origin: 'https://foo.live.openflow.build',
      config: CONFIG,
      tenantId: '',
    });
    expect(result.ok).toBe(false);
  });
});
