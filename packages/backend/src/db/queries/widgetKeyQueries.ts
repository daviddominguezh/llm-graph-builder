import type { SupabaseClient } from './operationHelpers.js';

/* ------------------------------------------------------------------ */
/*  Per-agent widget execution key queries                              */
/* ------------------------------------------------------------------ */

interface AgentWidgetRow {
  id: string;
  org_id: string;
  widget_execution_key_id: string | null;
}

function isAgentWidgetRow(value: unknown): value is AgentWidgetRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'org_id' in value &&
    'widget_execution_key_id' in value
  );
}

export interface AgentWidgetInfo {
  agentId: string;
  orgId: string;
  widgetExecutionKeyId: string | null;
}

export async function getAgentWidgetInfo(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ result: AgentWidgetInfo | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agents')
    .select('id, org_id, widget_execution_key_id')
    .eq('id', agentId)
    .single();

  if (error !== null) return { result: null, error: error.message };
  if (!isAgentWidgetRow(data)) return { result: null, error: 'Invalid agent data' };
  return {
    result: {
      agentId: data.id,
      orgId: data.org_id,
      widgetExecutionKeyId: data.widget_execution_key_id,
    },
    error: null,
  };
}

export async function updateAgentWidgetKeyId(
  supabase: SupabaseClient,
  agentId: string,
  keyId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('agents')
    .update({ widget_execution_key_id: keyId })
    .eq('id', agentId);
  if (error !== null) return { error: error.message };
  return { error: null };
}

export async function setExecutionKeyValue(
  supabase: SupabaseClient,
  keyId: string,
  value: string
): Promise<{ error: string | null }> {
  const result = await supabase.rpc('set_execution_key_value', {
    p_key_id: keyId,
    p_value: value,
  });
  if (result.error !== null) return { error: result.error.message };
  return { error: null };
}

export async function getExecutionKeyValue(
  supabase: SupabaseClient,
  keyId: string
): Promise<{ value: string | null; error: string | null }> {
  const result = await supabase.rpc('get_execution_key_value', { p_key_id: keyId });
  if (result.error !== null) return { value: null, error: result.error.message };
  const raw: unknown = result.data;
  return { value: typeof raw === 'string' ? raw : null, error: null };
}
