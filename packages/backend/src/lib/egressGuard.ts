import ipaddr from 'ipaddr.js';
import { lookup as dnsLookup } from 'node:dns/promises';

/**
 * Pure SSRF egress classifier. Given a URL, it rejects non-http(s) schemes and
 * literal hosts (IPv4/IPv6 addresses, `localhost`) that fall into a non-public
 * range (loopback, link-local incl. cloud metadata 169.254.169.254, RFC-1918
 * private, IPv6 ULA, etc.). No DNS, no `node:net` — DNS-resolving guards belong
 * to a later layer. An injectable allowlist exempts specific hosts/IPs.
 */
export type EgressBlockReason = 'scheme' | 'blocked';

/** WHATWG `URL.protocol` values (note the trailing colon) we permit. */
const ALLOWED_SCHEMES = new Set<string>(['http:', 'https:']);

/**
 * `ipaddr.js` range names that are NOT publicly routable (IPv4 + IPv6 unions).
 * Anything outside this set (`unicast`) is treated as public. IPv4-mapped IPv6
 * addresses are unwrapped before classification, so `ipv4Mapped` is handled by
 * re-checking the embedded IPv4 range rather than listing it here.
 */
const DENIED_RANGES = new Set<string>([
  'unspecified',
  'loopback',
  'private',
  'linkLocal',
  'uniqueLocal',
  'carrierGradeNat',
  'reserved',
  'broadcast',
  'multicast',
]);

const LOCALHOST = 'localhost';

export class EgressBlockedError extends Error {
  readonly reason: EgressBlockReason;

  constructor(reason: EgressBlockReason) {
    // Static message — never embed the URL/host (avoids leaking probe targets).
    super('Egress blocked');
    this.name = 'EgressBlockedError';
    this.reason = reason;
  }
}

export class EgressDnsError extends Error {
  constructor() {
    super('DNS resolution failed');
    this.name = 'EgressDnsError';
  }
}

function isIPv6(addr: ipaddr.IPv4 | ipaddr.IPv6): addr is ipaddr.IPv6 {
  return addr.kind() === 'ipv6';
}

/** Unwrap IPv4-mapped IPv6 to its embedded IPv4 so the v4 range is classified. */
function canonicalize(addr: ipaddr.IPv4 | ipaddr.IPv6): ipaddr.IPv4 | ipaddr.IPv6 {
  if (isIPv6(addr) && addr.isIPv4MappedAddress()) {
    return addr.toIPv4Address();
  }
  return addr;
}

function isPublicIp(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  return !DENIED_RANGES.has(canonicalize(addr).range());
}

/**
 * Throw `EgressBlockedError('blocked')` unless `ipText` is a valid, publicly
 * routable IP literal or is explicitly allowlisted.
 */
export function assertIpAllowed(ipText: string, allowlist: readonly string[] = []): void {
  if (allowlist.includes(ipText)) return;
  if (!ipaddr.isValid(ipText)) throw new EgressBlockedError('blocked');
  if (!isPublicIp(ipaddr.parse(ipText))) throw new EgressBlockedError('blocked');
}

/** Strip surrounding brackets from a WHATWG IPv6 hostname (`[::1]` -> `::1`). */
function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/gv, '');
}

function parseUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw new EgressBlockedError('scheme');
  }
}

/**
 * Validate scheme and literal host of `rawUrl`. Pure (no DNS). Non-literal
 * hostnames pass this layer and must be re-checked post-resolution elsewhere.
 */
export function assertSchemeAndLiteralHost(rawUrl: string, allowlist: readonly string[] = []): void {
  const url = parseUrl(rawUrl);
  if (!ALLOWED_SCHEMES.has(url.protocol)) throw new EgressBlockedError('scheme');

  const host = stripBrackets(url.hostname);
  if (allowlist.includes(host)) return;
  if (host.toLowerCase() === LOCALHOST) throw new EgressBlockedError('blocked');
  if (ipaddr.isValid(host)) assertIpAllowed(host, allowlist);
}

/** Injectable DNS seam so tests run without real network resolution. */
export interface EgressDeps {
  lookup: (host: string) => Promise<ReadonlyArray<{ address: string; family: number }>>;
}

const defaultDeps: EgressDeps = {
  lookup: async (host) => await dnsLookup(host, { all: true, verbatim: true }),
};

/**
 * DNS-resolving egress guard (anti-rebinding). Runs the pure scheme/literal
 * check first, then — for non-literal hostnames — resolves the host and asserts
 * EVERY returned address is publicly routable. Any single private/blocked IP
 * fails the whole check; a resolution failure throws `EgressDnsError`. Errors
 * stay host-agnostic so probe targets never leak.
 */
export async function resolveAndAssertEgress(
  rawUrl: string,
  allowlist: readonly string[] = [],
  deps: EgressDeps = defaultDeps
): Promise<void> {
  assertSchemeAndLiteralHost(rawUrl, allowlist);
  const host = stripBrackets(parseUrl(rawUrl).hostname);
  if (allowlist.includes(host) || ipaddr.isValid(host)) return;
  const records = await resolveHost(host, deps);
  for (const { address } of records) assertIpAllowed(address, allowlist);
}

/** Resolve `host` via the injected DNS seam, mapping any failure to `EgressDnsError`. */
async function resolveHost(host: string, deps: EgressDeps): Promise<ReadonlyArray<{ address: string }>> {
  try {
    return await deps.lookup(host);
  } catch {
    throw new EgressDnsError();
  }
}
