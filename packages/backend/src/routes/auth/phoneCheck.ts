import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import { serviceSupabase } from '../../db/client.js';
import { auditLog } from '../../lib/auditLog.js';
import { validatePhone } from '../../lib/phoneValidation.js';
import { createRateLimiter } from '../../lib/rateLimiter.js';

const BodySchema = z.object({ phone: z.string() });

const HTTP_BAD_REQUEST = 400;
const HTTP_RATE_LIMITED = 429;

const USER_PER_MIN_MAX = 5;
const USER_PER_DAY_MAX = 30;
const IP_PER_MIN_MAX = 60;
const MIN_MS = 60_000;
const HOURS_PER_DAY = 24;
const MINS_PER_HOUR = 60;
const DAY_MS = HOURS_PER_DAY * MINS_PER_HOUR * MIN_MS;

const userPerMinLimiter = createRateLimiter({ max: USER_PER_MIN_MAX, windowMs: MIN_MS });
const userPerDayLimiter = createRateLimiter({ max: USER_PER_DAY_MAX, windowMs: DAY_MS });
const ipPerMinLimiter = createRateLimiter({ max: IP_PER_MIN_MAX, windowMs: MIN_MS });

interface AuthUserRow {
  phone: string;
}

interface MaybeSingleResult {
  data: AuthUserRow | null;
  error: null;
}

interface FilterStep {
  maybeSingle: () => Promise<MaybeSingleResult>;
}

interface EqStep {
  eq: (col: string, val: string) => FilterStep;
  not: (col: string, filter: string, val: unknown) => FilterStep;
}

interface SelectStep {
  eq: (col: string, val: string) => EqStep;
}

interface AuthUsersTable {
  select: (cols: string) => SelectStep;
}

interface AuthSchemaClient {
  from: (table: 'users') => AuthUsersTable;
}

interface SchemaCapableClient {
  schema: (name: 'auth') => AuthSchemaClient;
}

function isSchemaCapable(v: unknown): v is SchemaCapableClient {
  return v !== null && typeof v === 'object' && 'schema' in v;
}

function requireSchemaCapable(v: unknown): SchemaCapableClient {
  if (!isSchemaCapable(v)) throw new Error('service client does not support schema()');
  return v;
}

function getUserId(res: Response): string {
  const v: unknown = res.locals.userId;
  if (typeof v !== 'string') throw new Error('userId missing');
  return v;
}

function isRateLimited(userId: string, ip: string): boolean {
  if (!userPerMinLimiter.consume(userId)) return true;
  if (!userPerDayLimiter.consume(`${userId}:day`)) return true;
  if (!ipPerMinLimiter.consume(ip)) return true;
  return false;
}

async function queryPhoneAvailable(e164: string): Promise<boolean> {
  const capable: SchemaCapableClient = requireSchemaCapable(serviceSupabase());
  const authClient: AuthSchemaClient = capable.schema('auth');
  const table: AuthUsersTable = authClient.from('users');
  const selectStep: SelectStep = table.select('phone');
  const eqStep: EqStep = selectStep.eq('phone', e164);
  const filterStep: FilterStep = eqStep.not('phone_confirmed_at', 'is', null);
  const { data } = await filterStep.maybeSingle();
  return data === null;
}

async function handlePhoneCheck(req: Request, res: Response): Promise<void> {
  const userId = getUserId(res);
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'invalid_body' });
    return;
  }
  const v = validatePhone(parsed.data.phone);
  if (!v.ok) {
    res.status(HTTP_BAD_REQUEST).json({ error: v.error });
    return;
  }
  const ip = req.ip ?? 'unknown';
  if (isRateLimited(userId, ip)) {
    res.status(HTTP_RATE_LIMITED).json({ error: 'rate_limited' });
    return;
  }
  const available = await queryPhoneAvailable(v.e164);
  await auditLog({ event: 'phone_check', userId, phone: v.e164, ip });
  res.json({ available });
}

export function phoneCheckRouter(): express.Router {
  const router = express.Router();
  router.post('/check', handlePhoneCheck);
  return router;
}
