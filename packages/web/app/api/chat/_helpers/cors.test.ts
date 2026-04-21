import { describe, expect, it } from '@jest/globals';
import { corsHeadersFor } from './cors.js';

describe('corsHeadersFor', () => {
  it('accepts valid tenant-agent origins', () => {
    const h = corsHeadersFor('https://acme-customer-care.live.openflow.build');
    expect(h['Access-Control-Allow-Origin']).toBe('https://acme-customer-care.live.openflow.build');
    expect(h['Access-Control-Allow-Headers']).toContain('Authorization');
    expect(h['Access-Control-Max-Age']).toBe('600');
  });

  it('rejects origin with invalid character in tenant slug', () => {
    expect(corsHeadersFor('https://ACME-bot.live.openflow.build')).toEqual({});
  });

  it('rejects a tenant slug over 40 chars', () => {
    const long = 'a'.repeat(41);
    expect(corsHeadersFor(`https://${long}-x.live.openflow.build`)).toEqual({});
  });

  it('rejects unknown hosts', () => {
    expect(corsHeadersFor('https://evil.example.com')).toEqual({});
  });
});
