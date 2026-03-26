import type { Request } from 'express';

/* ------------------------------------------------------------------ */
/*  Param interfaces                                                   */
/* ------------------------------------------------------------------ */

interface OrgIdParams {
  orgId?: string;
}

interface KeyIdParams {
  keyId?: string;
}

interface VarIdParams {
  varId?: string;
}

/* ------------------------------------------------------------------ */
/*  Param extractors                                                   */
/* ------------------------------------------------------------------ */

export function getOrgIdParam(req: Request): string | undefined {
  const { orgId }: OrgIdParams = req.params;
  if (typeof orgId === 'string' && orgId !== '') return orgId;
  return undefined;
}

export function getKeyIdParam(req: Request): string | undefined {
  const { keyId }: KeyIdParams = req.params;
  if (typeof keyId === 'string' && keyId !== '') return keyId;
  return undefined;
}

export function getVarIdParam(req: Request): string | undefined {
  const { varId }: VarIdParams = req.params;
  if (typeof varId === 'string' && varId !== '') return varId;
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Body helpers                                                       */
/* ------------------------------------------------------------------ */

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

export function parseStringField(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}

export function parseBooleanField(body: unknown, key: string): boolean | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (typeof value === 'boolean') return value;
  return undefined;
}

export function parseOptionalStringField(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (typeof value === 'string') return value;
  return undefined;
}

export function parseStringArrayField(body: unknown, key: string): string[] | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (!Array.isArray(value)) return undefined;
  if (!value.every((v): v is string => typeof v === 'string')) return undefined;
  return value;
}

export function parseNullableStringField(body: unknown, key: string): string | null | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return undefined;
}
