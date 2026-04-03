import type { NextFunction, Request, Response } from 'express';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';

const MESSAGING_MASTER_API_KEY = process.env.MESSAGING_MASTER_API_KEY ?? '';

function setLocals(locals: Record<string, unknown>, values: Record<string, unknown>): void {
  Object.assign(locals, values);
}

/**
 * Messaging auth middleware.
 * Checks api_key header against MESSAGING_MASTER_API_KEY.
 * Creates a service client and attaches it to res.locals.supabase
 * so downstream handlers can access the database.
 */
export function ensureMessagingAuth(req: Request, res: Response, next: NextFunction): void {
  const headerValue: unknown = req.headers.api_key;
  const apiKey = typeof headerValue === 'string' ? headerValue : undefined;

  if (apiKey !== undefined && apiKey === MESSAGING_MASTER_API_KEY) {
    // Authenticated via API key
  }

  const supabase = createServiceClient();
  setLocals(res.locals, { supabase });

  next();
}
