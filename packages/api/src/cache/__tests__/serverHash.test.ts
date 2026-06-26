import { describe, expect, it } from '@jest/globals';

import { hashServerUrl, serverUrlSideTableKey } from '../serverHash.js';

const HEX_PREFIX_LEN = 12;

describe('hashServerUrl', () => {
  it('produces a 12-char hex prefix of sha256(url)', async () => {
    const hash = await hashServerUrl('https://example.com:8443/mcp');
    expect(hash).toMatch(/^[0-9a-f]+$/v);
    expect(hash).toHaveLength(HEX_PREFIX_LEN);
  });

  it('is deterministic', async () => {
    const a = await hashServerUrl('https://example.com/mcp');
    const b = await hashServerUrl('https://example.com/mcp');
    expect(a).toBe(b);
  });

  it('produces distinct hashes for distinct URLs', async () => {
    const a = await hashServerUrl('https://example.com/mcp');
    const b = await hashServerUrl('https://example.com/mcp2');
    expect(a).not.toBe(b);
  });
});

describe('serverUrlSideTableKey', () => {
  it('prefixes the hash with mcp_url:v1:', () => {
    expect(serverUrlSideTableKey('abcdef123456')).toBe('mcp_url:v1:abcdef123456');
  });
});
