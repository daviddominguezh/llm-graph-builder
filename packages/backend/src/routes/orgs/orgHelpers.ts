import type { Request } from 'express';

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

interface OrgIdParams {
  orgId?: string;
}

interface SlugParams {
  slug?: string;
}

export function getOrgId(req: Request): string | undefined {
  const { orgId }: OrgIdParams = req.params;
  if (typeof orgId === 'string' && orgId !== '') return orgId;
  return undefined;
}

export function getSlugParam(req: Request): string | undefined {
  const { slug }: SlugParams = req.params;
  if (typeof slug === 'string' && slug !== '') return slug;
  return undefined;
}

export function parseStringField(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const { [key]: value } = body;
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}
