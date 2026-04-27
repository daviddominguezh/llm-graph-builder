import { matchOrigin, parseAllowedOriginEntry, parseOrigin } from './origins.js';

describe('parseOrigin', () => {
  it('parses https origin', () => {
    const parsed = parseOrigin('https://example.com');
    expect(parsed).not.toBeNull();
    expect(parsed?.protocol).toBe('https');
    expect(parsed?.hostname).toBe('example.com');
    expect(parsed?.port).toBeNull();
  });
  it('parses http://localhost:5173', () => {
    const parsed = parseOrigin('http://localhost:5173');
    expect(parsed).not.toBeNull();
    expect(parsed?.protocol).toBe('http');
    expect(parsed?.hostname).toBe('localhost');
    expect(parsed?.port).toBe('5173');
  });
  it('rejects trailing slash, path, query, fragment', () => {
    expect(parseOrigin('https://example.com/')).toBeNull();
    expect(parseOrigin('https://example.com/x')).toBeNull();
    expect(parseOrigin('https://example.com?q=1')).toBeNull();
    expect(parseOrigin('https://example.com#f')).toBeNull();
  });
  it('rejects unsupported protocols', () => {
    expect(parseOrigin('ftp://example.com')).toBeNull();
    expect(parseOrigin('ws://example.com')).toBeNull();
  });
  it('rejects wildcard in strict parse', () => {
    expect(parseOrigin('https://*.foo.com')).toBeNull();
  });
});

describe('parseAllowedOriginEntry', () => {
  it('accepts leading wildcard label', () => {
    const parsed = parseAllowedOriginEntry('https://*.foo.com');
    expect(parsed).not.toBeNull();
    expect(parsed?.hostname).toBe('*.foo.com');
  });
  it('rejects wildcard in non-leading position', () => {
    expect(parseAllowedOriginEntry('https://a.*.com')).toBeNull();
    expect(parseAllowedOriginEntry('https://a.foo.*')).toBeNull();
  });
  it('rejects bare wildcard', () => {
    expect(parseAllowedOriginEntry('https://*')).toBeNull();
  });
  it('accepts port', () => {
    const parsed = parseAllowedOriginEntry('http://localhost:3000');
    expect(parsed?.port).toBe('3000');
  });
});

describe('matchOrigin', () => {
  it('exact match', () => {
    expect(matchOrigin('https://example.com', ['https://example.com'])).toBe(true);
  });
  it('wildcard leading label match', () => {
    expect(matchOrigin('https://acme-bot.live.openflow.build', ['https://acme-*.live.openflow.build'])).toBe(
      false
    );
    expect(matchOrigin('https://foo.live.openflow.build', ['https://*.live.openflow.build'])).toBe(true);
  });
  it('wildcard does not match bare parent', () => {
    expect(matchOrigin('https://foo.com', ['https://*.foo.com'])).toBe(false);
  });
  it('wildcard only spans a single label', () => {
    expect(matchOrigin('https://a.b.foo.com', ['https://*.foo.com'])).toBe(false);
  });
  it('protocol mismatch fails', () => {
    expect(matchOrigin('http://example.com', ['https://example.com'])).toBe(false);
  });
  it('port mismatch fails', () => {
    expect(matchOrigin('http://localhost:3000', ['http://localhost:5173'])).toBe(false);
  });
  it('port match succeeds', () => {
    expect(matchOrigin('http://localhost:5173', ['http://localhost:5173'])).toBe(true);
  });
  it('empty allowlist returns false', () => {
    expect(matchOrigin('https://example.com', [])).toBe(false);
  });
  it('invalid origin returns false', () => {
    expect(matchOrigin('not-a-url', ['https://example.com'])).toBe(false);
  });
  it('invalid entry is skipped, not treated as match', () => {
    expect(matchOrigin('https://example.com', ['garbage', 'https://example.com'])).toBe(true);
    expect(matchOrigin('https://example.com', ['garbage'])).toBe(false);
  });
  it('hostname case-insensitive', () => {
    expect(matchOrigin('https://Example.COM', ['https://example.com'])).toBe(true);
  });
});
