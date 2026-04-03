import type { NextFunction, Request, Response } from 'express';

const MESSAGING_MASTER_API_KEY = process.env.MESSAGING_MASTER_API_KEY ?? '';

/**
 * Messaging auth middleware.
 * Checks api_key header against MESSAGING_MASTER_API_KEY.
 * For now, always calls next() — structure in place for real auth later.
 */
export function ensureMessagingAuth(req: Request, res: Response, next: NextFunction): void {
  const headerValue: unknown = req.headers.api_key;
  const apiKey = typeof headerValue === 'string' ? headerValue : undefined;

  if (apiKey !== undefined && apiKey === MESSAGING_MASTER_API_KEY) {
    // Authenticated via API key
  }

  // Always pass through for now
  next();
}
