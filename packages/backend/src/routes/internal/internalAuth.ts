import type { NextFunction, Request, Response } from 'express';

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? '';
const HTTP_UNAUTHORIZED = 401;
const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  if (!header.startsWith(BEARER_PREFIX)) return null;
  return header.slice(BEARER_PREFIX.length);
}

export function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);

  if (token === null) {
    res.status(HTTP_UNAUTHORIZED).json({ error: 'Missing authorization header' });
    return;
  }

  if (token !== INTERNAL_SERVICE_KEY || INTERNAL_SERVICE_KEY === '') {
    res.status(HTTP_UNAUTHORIZED).json({ error: 'Invalid service key' });
    return;
  }

  next();
}
