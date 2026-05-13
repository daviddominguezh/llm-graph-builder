import type { Request } from 'express';

interface OrgIdParams {
  orgId?: string;
}
interface StoreIdParams {
  storeId?: string;
}

export function getOrgIdParam(req: Request): string | undefined {
  const { orgId }: OrgIdParams = req.params;
  if (typeof orgId === 'string' && orgId !== '') return orgId;
  return undefined;
}

export function getStoreIdParam(req: Request): string | undefined {
  const { storeId }: StoreIdParams = req.params;
  if (typeof storeId === 'string' && storeId !== '') return storeId;
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
