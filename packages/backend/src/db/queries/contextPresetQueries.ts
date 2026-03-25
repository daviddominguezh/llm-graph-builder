import type { ContextPreset } from '@daviddh/graph-types';

import type { SupabaseClient } from './operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

function isContextPreset(value: unknown): value is ContextPreset {
  return typeof value === 'object' && value !== null && 'name' in value;
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function fetchContextPresets(
  supabase: SupabaseClient,
  agentId: string
): Promise<ContextPreset[]> {
  const { data } = await supabase.from('graph_context_presets').select('*').eq('agent_id', agentId);
  if (!Array.isArray(data)) return [];
  return data.filter(isContextPreset);
}
