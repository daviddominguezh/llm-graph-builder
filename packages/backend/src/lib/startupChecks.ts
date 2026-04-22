import type { Express } from 'express';

import { serviceSupabase } from '../db/client.js';
import { assertTrustProxy } from './trustProxyAssertion.js';

const REQUIRED_SECRETS = ['SUPABASE_SERVICE_ROLE_KEY', 'RATE_LIMIT_BUCKET_SECRET'];
const MIN_SECRET_BYTES = 32;
const REQUIRED_TABLES = ['otp_attempts', 'otp_cooldowns', 'auth_audit_log', 'user_onboarding'];
const TABLE_PROBE_LIMIT = 0;

function getEnvVar(key: string): string | undefined {
  const { env } = process;
  return env[key];
}

function checkSecret(key: string): void {
  const v = getEnvVar(key);
  if (v === undefined || v === '') throw new Error(`${key} is required`);
  if (Buffer.from(v).length < MIN_SECRET_BYTES) {
    throw new Error(`${key} must be >= ${MIN_SECRET_BYTES} bytes`);
  }
}

function checkSecrets(): void {
  for (const key of REQUIRED_SECRETS) {
    checkSecret(key);
  }
}

async function checkTable(tableName: string): Promise<void> {
  const service = serviceSupabase();
  const { error } = await service.from(tableName).select('*').limit(TABLE_PROBE_LIMIT);
  if (error !== null) {
    throw new Error(`Startup check: table public.${tableName} not reachable: ${error.message}`);
  }
}

async function checkTables(): Promise<void> {
  await Promise.all(REQUIRED_TABLES.map(checkTable));
}

export async function runStartupChecks(app: Express): Promise<void> {
  checkSecrets();
  // trust proxy = 1: XFF '1.2.3.4, 5.6.7.8' resolves to '5.6.7.8' (first untrusted hop)
  assertTrustProxy(app, { xff: '1.2.3.4, 5.6.7.8', expectedIp: '5.6.7.8' });
  await checkTables();
}
