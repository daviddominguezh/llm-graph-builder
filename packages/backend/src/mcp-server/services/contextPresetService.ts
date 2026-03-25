import type { ContextPreset } from '@daviddh/graph-types';

import { fetchContextPresets } from '../../db/queries/contextPresetQueries.js';
import { executeOperationsBatch } from '../../db/queries/operationExecutor.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ContextPresetInput {
  name: string;
  sessionId?: string;
  tenantId?: string;
  userId?: string;
  data?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Service functions                                                  */
/* ------------------------------------------------------------------ */

export async function listContextPresets(ctx: ServiceContext, agentId: string): Promise<ContextPreset[]> {
  return await fetchContextPresets(ctx.supabase, agentId);
}

export async function addContextPreset(
  ctx: ServiceContext,
  agentId: string,
  preset: ContextPresetInput
): Promise<void> {
  await executeOperationsBatch(ctx.supabase, agentId, [{ type: 'insertContextPreset', data: preset }]);
}

export async function updateContextPreset(
  ctx: ServiceContext,
  agentId: string,
  fields: ContextPresetInput
): Promise<void> {
  await executeOperationsBatch(ctx.supabase, agentId, [{ type: 'updateContextPreset', data: fields }]);
}

export async function deleteContextPreset(ctx: ServiceContext, agentId: string, name: string): Promise<void> {
  await executeOperationsBatch(ctx.supabase, agentId, [{ type: 'deleteContextPreset', name }]);
}
