import { matchOrigin } from '@openflow/shared-validation';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Origin guard for web-channel execute requests                       */
/*                                                                      */
/*  Applies only when body.channel === 'web'. Verifies:                 */
/*    1. tenantId belongs to the same org as the execution key          */
/*    2. tenant.web_channel_enabled                                     */
/*    3. request Origin matches tenant.web_channel_allowed_origins      */
/*       (shared matchOrigin semantics: exact or leading-label          */
/*       wildcard; case-insensitive hostname; protocol+port must match)*/
/* ------------------------------------------------------------------ */

export interface OriginGuardTenant {
  id: string;
  org_id: string;
  web_channel_enabled: boolean;
  web_channel_allowed_origins: string[];
}

/* Narrow surfaces for testability. */
export interface OriginGuardRequest {
  header: (name: string) => string | undefined;
}

export type TenantLookup = (tenantId: string) => Promise<OriginGuardTenant | null>;

export type OriginGuardOutcome = { ok: true } | { ok: false; status: number; error: string };

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;

function isTenantRow(value: unknown): value is OriginGuardTenant {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value &&
    'org_id' in value &&
    'web_channel_enabled' in value &&
    'web_channel_allowed_origins' in value
  );
}

export function createSupabaseTenantLookup(supabase: SupabaseClient): TenantLookup {
  return async (tenantId: string) => {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, org_id, web_channel_enabled, web_channel_allowed_origins')
      .eq('id', tenantId)
      .maybeSingle();
    if (error !== null) return null;
    return isTenantRow(data) ? data : null;
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
  lookupTenant: TenantLookup;
  tenantId: string;
  keyOrgId: string;
}

function checkTenantAccess(tenant: OriginGuardTenant | null, keyOrgId: string): OriginGuardOutcome | null {
  if (tenant === null) {
    return { ok: false, status: HTTP_FORBIDDEN, error: 'tenant_not_found' };
  }
  if (tenant.org_id !== keyOrgId) {
    return { ok: false, status: HTTP_FORBIDDEN, error: 'tenant_org_mismatch' };
  }
  if (!tenant.web_channel_enabled) {
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
  const tenant = await args.lookupTenant(args.tenantId);
  const access = checkTenantAccess(tenant, args.keyOrgId);
  if (access !== null) return access;
  const originCheck = checkOriginMatch(args.req, tenant?.web_channel_allowed_origins ?? []);
  if (originCheck !== null) return originCheck;
  return { ok: true };
}
