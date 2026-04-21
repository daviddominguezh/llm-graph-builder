import { describe, expect, it } from 'vitest';

import { parseAgentHost } from './parseHostname.js';

describe('parseAgentHost', () => {
  it('parses canonical form', () => {
    expect(parseAgentHost('acme-customer-care.live.openflow.build')).toEqual({
      tenant: 'acme',
      agentSlug: 'customer-care',
    });
  });
  it('lowercases input', () => {
    expect(parseAgentHost('ACME-Customer-Care.live.openflow.build')).toEqual({
      tenant: 'acme',
      agentSlug: 'customer-care',
    });
  });
  it('strips port and trailing dot', () => {
    expect(parseAgentHost('acme-x.live.openflow.build:443')).toEqual({ tenant: 'acme', agentSlug: 'x' });
    expect(parseAgentHost('acme-x.live.openflow.build.')).toEqual({ tenant: 'acme', agentSlug: 'x' });
  });
  it('rejects non-ASCII', () => {
    expect(parseAgentHost('cafés-bot.live.openflow.build')).toBeNull();
  });
  it('rejects malformed', () => {
    expect(parseAgentHost('justatenant.live.openflow.build')).toBeNull();
    expect(parseAgentHost('-bad.live.openflow.build')).toBeNull();
    expect(parseAgentHost('bad-.live.openflow.build')).toBeNull();
    expect(parseAgentHost('some.other.host')).toBeNull();
  });
});
