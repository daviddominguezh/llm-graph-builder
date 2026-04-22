export const TENANT_SLUG_REGEX = /^[a-z0-9]{1,40}$/;
export const AGENT_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const AGENT_SLUG_MAX_LENGTH = 40;

export const RESERVED_TENANT_SLUGS = new Set<string>([
  'app',
  'api',
  'www',
  'live',
  'admin',
  'assets',
  'cdn',
  'docs',
  'status',
  'root',
  'support',
  'help',
  'blog',
  'mail',
  'email',
  'auth',
  'oauth',
  'static',
  'public',
  'internal',
  'staging',
  'preview',
  'dev',
  'localhost',
]);

export function isValidTenantSlug(s: string): boolean {
  if (typeof s !== 'string') return false;
  if (!TENANT_SLUG_REGEX.test(s)) return false;
  return !RESERVED_TENANT_SLUGS.has(s);
}

export function isValidAgentSlug(s: string): boolean {
  return typeof s === 'string'
    && s.length <= AGENT_SLUG_MAX_LENGTH
    && AGENT_SLUG_REGEX.test(s);
}

export function sortedReservedTenantSlugs(): string[] {
  return [...RESERVED_TENANT_SLUGS].sort();
}

export * from './onboarding.js';
export * from './origins.js';
