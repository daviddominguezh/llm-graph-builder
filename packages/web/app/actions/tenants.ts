'use server';

import { serverError, serverLog } from '@/app/lib/serverLogger';
import type { TenantRow } from '@/app/lib/tenants';
import {
  createTenant as createTenantLib,
  deleteTenant as deleteTenantLib,
  getTenantsByOrg as getTenantsByOrgLib,
  updateTenant as updateTenantLib,
} from '@/app/lib/tenants';

export async function getTenantsByOrgAction(
  orgId: string
): Promise<{ result: TenantRow[]; error: string | null }> {
  serverLog('[getTenantsByOrgAction] orgId:', orgId);
  const res = await getTenantsByOrgLib(orgId);
  if (res.error === null) serverLog('[getTenantsByOrgAction] found', res.result.length, 'tenants');
  else serverError('[getTenantsByOrgAction] error:', res.error);
  return res;
}

export async function createTenantAction(
  orgId: string,
  name: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  serverLog('[createTenantAction] orgId:', orgId, 'name:', name);
  const res = await createTenantLib(orgId, name);
  if (res.error === null) serverLog('[createTenantAction] created tenant:', res.result?.id);
  else serverError('[createTenantAction] error:', res.error);
  return res;
}

export async function updateTenantAction(
  tenantId: string,
  name: string
): Promise<{ result: TenantRow | null; error: string | null }> {
  serverLog('[updateTenantAction] tenantId:', tenantId);
  const res = await updateTenantLib(tenantId, name);
  if (res.error === null) serverLog('[updateTenantAction] updated tenant:', res.result?.id);
  else serverError('[updateTenantAction] error:', res.error);
  return res;
}

export async function deleteTenantAction(tenantId: string): Promise<{ error: string | null }> {
  serverLog('[deleteTenantAction] tenantId:', tenantId);
  const res = await deleteTenantLib(tenantId);
  if (res.error !== null) serverError('[deleteTenantAction] error:', res.error);
  return res;
}
