import type { Graph } from '@daviddh/graph-types';
import { GraphSchema } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';

export class VersionNotFoundError extends Error {
  constructor(version: number) {
    super(`Version ${String(version)} not found`);
    this.name = 'VersionNotFoundError';
  }
}

const VERSION_NOT_FOUND_PREFIX = 'VERSION_NOT_FOUND:';

function isRpcVersionNotFound(message: string): boolean {
  return message.includes(VERSION_NOT_FOUND_PREFIX);
}

function parseGraphSnapshot(raw: unknown): Graph {
  const parsed = GraphSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(`Invalid graph snapshot: ${parsed.error.message}`);
  }

  return parsed.data;
}

export async function restoreVersion(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<Graph> {
  const result = await supabase.rpc('restore_version_tx', {
    p_agent_id: agentId,
    p_version: version,
  });

  if (result.error !== null) {
    if (isRpcVersionNotFound(result.error.message)) {
      throw new VersionNotFoundError(version);
    }
    throw new Error(`restoreVersion: ${result.error.message}`);
  }

  return parseGraphSnapshot(result.data);
}
