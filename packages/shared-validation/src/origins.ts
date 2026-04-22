/* ------------------------------------------------------------------ */
/*  Origin parsing + wildcard-subdomain matching                       */
/*                                                                      */
/*  Used by:                                                            */
/*    - backend (execute origin guard for web channel)                  */
/*    - web (tenant settings card validation)                           */
/*    - widget (gate rendering against allowlist)                       */
/*                                                                      */
/*  Entry format:                                                       */
/*    {protocol}://{hostname}[:port]                                    */
/*  where protocol is http|https; hostname supports `*` only as the     */
/*  leading subdomain label (e.g. https://*.foo.com), not mid-host.     */
/*  Bare localhost (with or without port) is valid. No path/query/frag. */
/* ------------------------------------------------------------------ */

const ALLOWED_PROTOCOLS = ['http', 'https'] as const;
type AllowedProtocol = (typeof ALLOWED_PROTOCOLS)[number];

export interface ParsedOrigin {
  protocol: AllowedProtocol;
  hostname: string;
  port: string | null;
}

const ORIGIN_REGEX = /^(https?):\/\/([^/?#]+)$/;
const HOSTNAME_LABEL_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const WILDCARD_LABEL = '*';
const PORT_REGEX = /^\d{1,5}$/;
const MAX_PORT = 65535;
const LOCALHOST = 'localhost';

function isAllowedProtocol(value: string): value is AllowedProtocol {
  return (ALLOWED_PROTOCOLS as readonly string[]).includes(value);
}

function splitHostPort(hostPort: string): { host: string; port: string | null } | null {
  const colonIndex = hostPort.lastIndexOf(':');
  if (colonIndex === -1) return { host: hostPort, port: null };
  const host = hostPort.slice(0, colonIndex);
  const port = hostPort.slice(colonIndex + 1);
  if (host === '') return null;
  if (!PORT_REGEX.test(port)) return null;
  const portNum = Number(port);
  if (portNum < 1 || portNum > MAX_PORT) return null;
  return { host, port };
}

function isValidHostLabel(label: string, allowWildcard: boolean): boolean {
  if (allowWildcard && label === WILDCARD_LABEL) return true;
  return HOSTNAME_LABEL_REGEX.test(label);
}

function isValidHostname(host: string, allowWildcard: boolean): boolean {
  if (host === LOCALHOST) return true;
  const labels = host.split('.');
  if (labels.length === 0) return false;
  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i];
    if (label === undefined || label === '') return false;
    // Wildcard is only legal as the very first label
    const wildcardHere = allowWildcard && i === 0;
    if (!isValidHostLabel(label, wildcardHere)) return false;
  }
  // Plain `*` alone is not meaningful — require at least a parent domain
  if (allowWildcard && labels[0] === WILDCARD_LABEL && labels.length < 2) return false;
  return true;
}

function buildParsed(
  protocol: AllowedProtocol,
  host: string,
  port: string | null
): ParsedOrigin {
  return { protocol, hostname: host.toLowerCase(), port };
}

/* ------------------------------------------------------------------ */
/*  parseOrigin(raw) — strict parse, no wildcards                      */
/*  Used on user-provided origins and on the incoming request origin.  */
/* ------------------------------------------------------------------ */
export function parseOrigin(raw: string): ParsedOrigin | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const match = ORIGIN_REGEX.exec(trimmed);
  if (match === null) return null;
  const [, protocol, hostPort] = match;
  if (protocol === undefined || hostPort === undefined) return null;
  if (!isAllowedProtocol(protocol)) return null;
  const split = splitHostPort(hostPort);
  if (split === null) return null;
  const lowerHost = split.host.toLowerCase();
  if (!isValidHostname(lowerHost, false)) return null;
  return buildParsed(protocol, lowerHost, split.port);
}

/* ------------------------------------------------------------------ */
/*  parseAllowedOriginEntry(raw) — allows leading `*` wildcard label.  */
/*  Used for allowlist entries stored on tenants.                      */
/* ------------------------------------------------------------------ */
export function parseAllowedOriginEntry(raw: string): ParsedOrigin | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const match = ORIGIN_REGEX.exec(trimmed);
  if (match === null) return null;
  const [, protocol, hostPort] = match;
  if (protocol === undefined || hostPort === undefined) return null;
  if (!isAllowedProtocol(protocol)) return null;
  const split = splitHostPort(hostPort);
  if (split === null) return null;
  const lowerHost = split.host.toLowerCase();
  if (!isValidHostname(lowerHost, true)) return null;
  return buildParsed(protocol, lowerHost, split.port);
}

function hostnamesMatch(entry: ParsedOrigin, target: ParsedOrigin): boolean {
  if (entry.hostname === target.hostname) return true;
  // Wildcard in leading label: `*.foo.com` matches `<anything>.foo.com`
  const entryLabels = entry.hostname.split('.');
  if (entryLabels[0] !== WILDCARD_LABEL) return false;
  const targetLabels = target.hostname.split('.');
  if (entryLabels.length !== targetLabels.length) return false;
  for (let i = 1; i < entryLabels.length; i += 1) {
    if (entryLabels[i] !== targetLabels[i]) return false;
  }
  return true;
}

function entryMatches(entry: ParsedOrigin, target: ParsedOrigin): boolean {
  if (entry.protocol !== target.protocol) return false;
  if (entry.port !== target.port) return false;
  return hostnamesMatch(entry, target);
}

/* ------------------------------------------------------------------ */
/*  matchOrigin(origin, allowed) — true if origin matches any entry.   */
/*  Both backend and widget use identical semantics.                   */
/* ------------------------------------------------------------------ */
export function matchOrigin(origin: string, allowedOrigins: string[]): boolean {
  const target = parseOrigin(origin);
  if (target === null) return false;
  for (const raw of allowedOrigins) {
    const entry = parseAllowedOriginEntry(raw);
    if (entry === null) continue;
    if (entryMatches(entry, target)) return true;
  }
  return false;
}
