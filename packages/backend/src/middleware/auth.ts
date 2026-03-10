import type { NextFunction, Request, Response } from 'express';

import { createSupabaseClient } from '../db/client.js';

const BEARER_PREFIX = 'Bearer ';
const HTTP_UNAUTHORIZED = 401;

function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  if (!header.startsWith(BEARER_PREFIX)) return null;
  return header.slice(BEARER_PREFIX.length);
}

function sendUnauthorized(res: Response, message: string): void {
  res.status(HTTP_UNAUTHORIZED).json({ error: message });
}

function setLocals(locals: Record<string, unknown>, values: Record<string, unknown>): void {
  Object.assign(locals, values);
}

/**
 * Express middleware that verifies a Supabase JWT from the
 * Authorization header, then attaches the authenticated
 * Supabase client and user ID to `res.locals`.
 *
 * Usage:
 *   res.locals.supabase  -- SupabaseClient scoped to the user
 *   res.locals.userId    -- the authenticated user's UUID
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const jwt = extractBearerToken(req.headers.authorization);

  if (jwt === null) {
    sendUnauthorized(res, 'Missing or malformed Authorization header');
    return;
  }

  const supabase = createSupabaseClient(jwt);
  const result = await supabase.auth.getUser();

  if (result.error !== null) {
    sendUnauthorized(res, 'Invalid or expired token');
    return;
  }

  setLocals(res.locals, { supabase, userId: result.data.user.id });
  next();
}
