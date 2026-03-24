/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isExecutionKeyRow(value: unknown): value is ExecutionKeyRow {
  return typeof value === 'object' && value !== null && 'id' in value && 'key_prefix' in value;
}

export function isExecutionKeyAgent(value: unknown): value is ExecutionKeyAgent {
  return typeof value === 'object' && value !== null && 'agent_id' in value && 'agent_name' in value;
}

/* ------------------------------------------------------------------ */
/*  Mappers                                                            */
/* ------------------------------------------------------------------ */

export function mapExecutionKeyRows(data: unknown[]): ExecutionKeyRow[] {
  return data.reduce<ExecutionKeyRow[]>((acc, row) => {
    if (isExecutionKeyRow(row)) acc.push(row);
    return acc;
  }, []);
}

export function mapExecutionKeyAgents(data: unknown[]): ExecutionKeyAgent[] {
  return data.reduce<ExecutionKeyAgent[]>((acc, row) => {
    if (isExecutionKeyAgent(row)) acc.push(row);
    return acc;
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Re-exports from queries                                            */
/* ------------------------------------------------------------------ */

export {
  createExecutionKey,
  deleteExecutionKey,
  getAgentsForKey,
  getExecutionKeysByOrg,
  updateExecutionKeyAgents,
  updateExecutionKeyName,
} from './executionKeysQueries';

export type { CreateExecutionKeyResult } from './executionKeysQueries';
