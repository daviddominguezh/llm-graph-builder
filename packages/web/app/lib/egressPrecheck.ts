/**
 * Layer-1 SSRF literal-host pre-check for the web MCP discover proxy.
 *
 * Cheap, synchronous, bundle-safe (NO `node:*` imports — `ipaddr.js` only) copy
 * of the backend egress classifier's literal/scheme logic, returning a boolean
 * instead of throwing. It is best-effort defense-in-depth: it lets us reject
 * obvious-bad URLs at the edge without a backend round-trip. The authoritative,
 * DNS-resolving guard lives backend-side, so non-literal hostnames are allowed
 * through this layer (DNS re-check happens there).
 *
 * Blocks: non-http(s) schemes, and literal IPs / `localhost` in a denied range
 * (loopback/127.x, ::1, 169.254/16 link-local, RFC-1918 private, IPv6
 * link-local + ULA, and IPv4-mapped IPv6 wrapping any of the above). Public
 * literals (e.g. 1.1.1.1) and bare hostnames are NOT blocked here.
 */
import ipaddr from 'ipaddr.js';

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

type IpAddress = ipaddr.IPv4 | ipaddr.IPv6;

function isIPv6(addr: IpAddress): addr is ipaddr.IPv6 {
  return addr.kind() === 'ipv6';
}

/** Unwrap IPv4-mapped IPv6 to its embedded IPv4 so the v4 range is classified. */
function canonicalize(addr: IpAddress): IpAddress {
  if (isIPv6(addr) && addr.isIPv4MappedAddress()) {
    return addr.toIPv4Address();
  }
  return addr;
}

function isPublicIp(addr: IpAddress): boolean {
  return !DENIED_RANGES.has(canonicalize(addr).range());
}

/** Strip surrounding brackets from a WHATWG IPv6 hostname (`[::1]` -> `::1`). */
function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/gv, '');
}

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

/**
 * Returns `true` when `rawUrl` should be blocked at the web edge: an unparseable
 * URL, a non-http(s) scheme, `localhost`, or a literal IP in a denied range.
 * Bare (non-literal) hostnames return `false` — they pass this layer.
 */
export function isLiteralBlocked(rawUrl: string): boolean {
  const url = parseUrl(rawUrl);
  if (url === null) return true;
  if (!ALLOWED_SCHEMES.has(url.protocol)) return true;

  const host = stripBrackets(url.hostname);
  if (host.toLowerCase() === LOCALHOST) return true;
  if (!ipaddr.isValid(host)) return false;
  return !isPublicIp(ipaddr.parse(host));
}
