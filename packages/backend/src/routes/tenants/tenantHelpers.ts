import type { Request } from 'express';

interface TenantIdParams {
  tenantId?: string;
}

interface OrgIdParams {
  orgId?: string;
}

export function getTenantIdParam(req: Request): string | undefined {
  const { tenantId }: TenantIdParams = req.params;
  if (typeof tenantId === 'string' && tenantId !== '') return tenantId;
  return undefined;
}

export function getOrgIdParam(req: Request): string | undefined {
  const { orgId }: OrgIdParams = req.params;
  if (typeof orgId === 'string' && orgId !== '') return orgId;
  return undefined;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

export function parseStringField(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}
