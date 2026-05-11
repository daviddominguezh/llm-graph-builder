import type { Request } from 'express';

interface StoreIdParams {
  storeId?: string;
}
interface FileIdParams {
  id?: string;
}

export function getStoreIdParam(req: Request): string | undefined {
  const { storeId }: StoreIdParams = req.params;
  if (typeof storeId === 'string' && storeId !== '') return storeId;
  return undefined;
}

export function getFileIdParam(req: Request): string | undefined {
  const { id }: FileIdParams = req.params;
  if (typeof id === 'string' && id !== '') return id;
  return undefined;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

export function parseString(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}

export function parseNumber(body: unknown, key: string): number | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}
