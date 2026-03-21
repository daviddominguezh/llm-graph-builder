import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

export interface ExecutionKeyRow {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ExecutionKeyAgent {
  agent_id: string;
  agent_name: string;
  agent_slug: string;
}

export interface ExecutionKeyWithAgents extends ExecutionKeyRow {
  agents: ExecutionKeyAgent[];
}

export function isExecutionKeyRow(value: unknown): value is ExecutionKeyRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'key_prefix' in value;
}

export function mapExecutionKeyRows(data: unknown[]): ExecutionKeyRow[] {
  return data.reduce<ExecutionKeyRow[]>((acc, row) => {
    if (isExecutionKeyRow(row)) acc.push(row);
    return acc;
  }, []);
}

const KEY_PREFIX = 'clr_';
const KEY_BYTES = 48;
const DISPLAY_PREFIX_LENGTH = 12;

export function generateExecutionKey(): { fullKey: string; keyHash: string; keyPrefix: string } {
  const randomPart = randomBytes(KEY_BYTES).toString('base64url');
  const fullKey = `${KEY_PREFIX}${randomPart}`;
  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = fullKey.slice(0, DISPLAY_PREFIX_LENGTH) + '...';
  return { fullKey, keyHash, keyPrefix };
}

export {
  createExecutionKey,
  deleteExecutionKey,
  getAgentsForKey,
  getExecutionKeysByOrg,
  updateExecutionKeyAgents,
  updateExecutionKeyName,
} from './execution-keys-queries';

export type { CreateExecutionKeyResult } from './execution-keys-queries';

const EXECUTION_KEY_COLUMNS = 'id, org_id, name, key_prefix, expires_at, created_at, last_used_at';

export function isExecutionKeyAgent(value: unknown): value is ExecutionKeyAgent {
  return typeof value === 'object' && value !== null && 'agent_id' in value && 'agent_name' in value;
}

export function mapExecutionKeyAgents(data: unknown[]): ExecutionKeyAgent[] {
  return data.reduce<ExecutionKeyAgent[]>((acc, row) => {
    if (isExecutionKeyAgent(row)) acc.push(row);
    return acc;
  }, []);
}

export { EXECUTION_KEY_COLUMNS };

export type { SupabaseClient };
