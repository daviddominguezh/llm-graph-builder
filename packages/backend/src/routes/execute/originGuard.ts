import { matchOrigin } from '@openflow/shared-validation';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Origin guard for web-channel execute requests                       */
/*                                                                      */
/*  Applies only when body.channel === 'web'. Verifies:                 */
/*    1. tenant.web_channel_enabled                                     */
/*    2. request Origin matches tenant.web_channel_allowed_origins      */
/*       (shared matchOrigin semantics: exact or leading-label          */
/*       wildcard; case-insensitive hostname; protocol+port must match)*/
/*                                                                      */
/*  Tenant-to-org binding + execution-key tenant allowlist are now     */
/*  enforced by the channel-agnostic enforceTenantScope guard, which   */
/*  runs BEFORE this one.                                              */
/* ------------------------------------------------------------------ */

export interface OriginGuardTenantWebConfig {
  web_channel_enabled: boolean;
  web_channel_allowed_origins: string[];
}

/* Narrow surfaces for testability. */
export interface OriginGuardRequest {
  header: (name: string) => string | undefined;
}

export type WebConfigLookup = (tenantId: string) => Promise<OriginGuardTenantWebConfig | null>;

export type OriginGuardOutcome = { ok: true } | { ok: false; status: number; error: string };

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;

function isWebConfigRow(value: unknown): value is OriginGuardTenantWebConfig {
  if (typeof value !== 'object' || value === null) return false;
  return 'web_channel_enabled' in value && 'web_channel_allowed_origins' in value;
}

export function createSupabaseWebConfigLookup(supabase: SupabaseClient): WebConfigLookup {
  return async (tenantId: string) => {
    const { data, error } = await supabase
      .from('tenants')
      .select('web_channel_enabled, web_channel_allowed_origins')
      .eq('id', tenantId)
      .maybeSingle();
    if (error !== null) return null;
    return isWebConfigRow(data) ? data : null;
  };
}

function deriveOrigin(req: OriginGuardRequest): string | null {
  const origin = req.header('origin');
  if (typeof origin === 'string' && origin !== '') return origin;
  const referer = req.header('referer');
  if (typeof referer !== 'string' || referer === '') return null;
  try {
    const parsed = new URL(referer);
    return parsed.origin;
  } catch {
    return null;
  }
}

/* re-export so the guard+helper can be used via a single import in tests */
export { matchOrigin };

export interface OriginGuardArgs {
  req: OriginGuardRequest;
  lookupWebConfig: WebConfigLookup;
  tenantId: string;
}

function checkWebConfig(config: OriginGuardTenantWebConfig | null): OriginGuardOutcome | null {
  if (config === null) {
    return { ok: false, status: HTTP_FORBIDDEN, error: 'tenant_not_found' };
  }
  if (!config.web_channel_enabled) {
    return { ok: false, status: HTTP_FORBIDDEN, error: 'web_channel_disabled' };
  }
  return null;
}

function checkOriginMatch(req: OriginGuardRequest, allowed: string[]): OriginGuardOutcome | null {
  const origin = deriveOrigin(req);
  if (origin === null || !matchOrigin(origin, allowed)) {
    return { ok: false, status: HTTP_FORBIDDEN, error: 'origin_not_allowed' };
  }
  return null;
}

export async function enforceWebChannelOrigin(args: OriginGuardArgs): Promise<OriginGuardOutcome> {
  if (args.tenantId === '') {
    return { ok: false, status: HTTP_BAD_REQUEST, error: 'tenantId is required' };
  }
  const config = await args.lookupWebConfig(args.tenantId);
  const access = checkWebConfig(config);
  if (access !== null) return access;
  const originCheck = checkOriginMatch(args.req, config?.web_channel_allowed_origins ?? []);
  if (originCheck !== null) return originCheck;
  return { ok: true };
}
