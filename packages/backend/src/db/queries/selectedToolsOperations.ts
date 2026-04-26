import type { SelectedTool } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from './operationHelpers.js';

export interface UpdateSelectedToolsArgs {
  agentId: string;
  tools: SelectedTool[];
  expectedUpdatedAt: string;
}

export interface UpdateSelectedToolsRow {
  selected_tools: SelectedTool[];
  updated_at: string;
}

export type UpdateSelectedToolsResult =
  | { kind: 'ok'; row: UpdateSelectedToolsRow }
  | { kind: 'conflict' };

export async function updateSelectedToolsWithPrecondition(
  supabase: SupabaseClient,
  args: UpdateSelectedToolsArgs
): Promise<UpdateSelectedToolsResult> {
  const result = await supabase
    .from('agents')
    .update({ selected_tools: args.tools, updated_at: new Date().toISOString() })
    .eq('id', args.agentId)
    .eq('updated_at', args.expectedUpdatedAt)
    .select('selected_tools, updated_at')
    .single();

  if (result.error !== null) {
    if (result.error.code === 'PGRST116') return { kind: 'conflict' };
    throw new Error(`updateSelectedToolsWithPrecondition: ${result.error.message}`);
  }
  return { kind: 'ok', row: result.data as UpdateSelectedToolsRow };
}
