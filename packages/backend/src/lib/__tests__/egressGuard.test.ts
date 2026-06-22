import { describe, expect, it } from '@jest/globals';

import type { EgressDeps } from '../egressGuard.js';
import {
  EgressBlockedError,
  EgressDnsError,
  assertSchemeAndLiteralHost,
  resolveAndAssertEgress,
} from '../egressGuard.js';

const ONE_ASSERTION = 1;

const BLOCKED_HOSTS = [
  '127.0.0.1',
  'localhost',
  '169.254.169.254',
  '10.1.2.3',
  '172.16.0.1',
  '192.168.1.1',
  '0.0.0.0',
  '[::1]',
  '[fe80::1]',
  '[fc00::1]',
  '[::ffff:127.0.0.1]',
  '0177.0.0.1',
];
const BLOCKED_SCHEMES = ['file', 'ftp', 'gopher', 'data', 'ws'];
const PUBLIC_HOSTS = ['1.1.1.1', '8.8.8.8', 'example.com', '[2606:4700:4700::1111]'];

/** Capture the thrown EgressBlockedError without an unsafe cast. */
function reasonOf(rawUrl: string, allowlist?: readonly string[]): string {
  try {
    assertSchemeAndLiteralHost(rawUrl, allowlist);
  } catch (e) {
    if (e instanceof EgressBlockedError) return e.reason;
    throw e;
  }
  throw new Error('expected EgressBlockedError to be thrown');
}

describe('assertSchemeAndLiteralHost — classification', () => {
  it.each(BLOCKED_HOSTS)('blocks literal host %s', (host) => {
    expect(() => {
      assertSchemeAndLiteralHost(`http://${host}/x`);
    }).toThrow(EgressBlockedError);
  });

  it.each(BLOCKED_SCHEMES)('blocks %s scheme', (scheme) => {
    expect(() => {
      assertSchemeAndLiteralHost(`${scheme}://example.com/x`);
    }).toThrow(EgressBlockedError);
  });

  it.each(PUBLIC_HOSTS)('allows public host %s', (host) => {
    expect(() => {
      assertSchemeAndLiteralHost(`https://${host}/x`);
    }).not.toThrow();
  });
});

describe('assertSchemeAndLiteralHost — allowlist', () => {
  it('does not throw for a denied IP that is on the allowlist', () => {
    expect(() => {
      assertSchemeAndLiteralHost('http://10.1.2.3/x', ['10.1.2.3']);
    }).not.toThrow();
  });

  it('does not throw for a denied host name that is on the allowlist', () => {
    expect(() => {
      assertSchemeAndLiteralHost('http://localhost/x', ['localhost']);
    }).not.toThrow();
  });
});

describe('assertSchemeAndLiteralHost — reason + message', () => {
  it('sets reason=scheme for a bad scheme', () => {
    expect(reasonOf('file://example.com')).toBe('scheme');
  });

  it('sets reason=blocked for a bad host', () => {
    expect(reasonOf('http://127.0.0.1')).toBe('blocked');
  });

  it('throws reason=scheme for an unparseable URL', () => {
    expect(reasonOf('not a url')).toBe('scheme');
  });

  it('does not embed the host in the error message', () => {
    expect.assertions(ONE_ASSERTION);
    try {
      assertSchemeAndLiteralHost('http://169.254.169.254/latest/meta-data');
    } catch (e) {
      if (e instanceof EgressBlockedError) expect(e.message).not.toContain('169.254');
    }
  });
});

const IPV6_FAMILY = 6;
const IPV4_FAMILY = 4;

const mockLookup = (addrs: readonly string[]): EgressDeps => ({
  lookup: async () =>
    await Promise.resolve(
      addrs.map((address) => ({ address, family: address.includes(':') ? IPV6_FAMILY : IPV4_FAMILY }))
    ),
});

const failingLookup: EgressDeps = {
  lookup: async () => {
    const e = new Error('boom') as NodeJS.ErrnoException;
    e.code = 'ENOTFOUND';
    return await Promise.reject(e);
  },
};

describe('resolveAndAssertEgress', () => {
  it('passes when every resolved IP is public', async () => {
    await expect(
      resolveAndAssertEgress('https://evil.test/x', [], mockLookup(['1.1.1.1']))
    ).resolves.toBeUndefined();
  });

  it('blocks when host resolves to IMDS (rebinding)', async () => {
    await expect(
      resolveAndAssertEgress('https://evil.test/x', [], mockLookup(['169.254.169.254']))
    ).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('blocks when ANY resolved IP is private (mixed public+private)', async () => {
    await expect(
      resolveAndAssertEgress('https://evil.test/x', [], mockLookup(['1.1.1.1', '10.0.0.5']))
    ).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('throws EgressDnsError on resolution failure', async () => {
    await expect(resolveAndAssertEgress('https://nope.test/x', [], failingLookup)).rejects.toBeInstanceOf(
      EgressDnsError
    );
  });

  it('still blocks a literal-IP URL before DNS (scheme/literal short-circuit)', async () => {
    await expect(
      resolveAndAssertEgress('http://10.1.2.3/x', [], mockLookup(['1.1.1.1']))
    ).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('bypasses DNS for an allowlisted hostname', async () => {
    await expect(
      resolveAndAssertEgress('https://internal.test/x', ['internal.test'], failingLookup)
    ).resolves.toBeUndefined();
  });
});
