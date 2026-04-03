import type { NextFunction, Request, Response } from 'express';

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? '';

export function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader === undefined || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);
  if (token !== INTERNAL_SERVICE_KEY || INTERNAL_SERVICE_KEY === '') {
    res.status(401).json({ error: 'Invalid service key' });
    return;
  }

  next();
}
