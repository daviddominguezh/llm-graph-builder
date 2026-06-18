import type { NextFunction, Request, Response } from 'express';

const HTTP_UNAUTHORIZED = 401;

function getMasterKey(): string {
  return process.env.EDGE_FUNCTION_MASTER_KEY ?? '';
}

function extractMasterKey(req: Request): string | null {
  const { headers } = req;
  const { 'x-master-key': value } = headers;
  if (typeof value !== 'string' || value === '') return null;
  return value;
}

export function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractMasterKey(req);

  if (token === null) {
    res.status(HTTP_UNAUTHORIZED).json({ error: 'Missing x-master-key header' });
    return;
  }

  const expected = getMasterKey();
  if (expected === '' || token !== expected) {
    res.status(HTTP_UNAUTHORIZED).json({ error: 'Invalid master key' });
    return;
  }

  next();
}
