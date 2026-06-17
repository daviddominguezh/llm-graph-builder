import type { SupabaseClient } from '@supabase/supabase-js';

export interface AgentStoreBindings {
  selectedKvStoreId: string | null;
  selectedRagStoreId: string | null;
  updatedAt: string;
}

interface BindingsRow {
  selected_kv_store_id: string | null;
  selected_rag_store_id: string | null;
  updated_at: string;
}

function isBindingsRow(value: unknown): value is BindingsRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'selected_kv_store_id' in value && 'selected_rag_store_id' in value && 'updated_at' in value;
}

function toBindings(row: BindingsRow): AgentStoreBindings {
  return {
    selectedKvStoreId: row.selected_kv_store_id,
    selectedRagStoreId: row.selected_rag_store_id,
    updatedAt: row.updated_at,
  };
}

export async function getAgentStoreBindings(
  supabase: SupabaseClient,
  agentId: string
): Promise<{ result: AgentStoreBindings | null; error: string | null }> {
  const { data, error } = await supabase
    .from('agents')
    .select('selected_kv_store_id, selected_rag_store_id, updated_at')
    .eq('id', agentId)
    .maybeSingle();
  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isBindingsRow(data)) return { result: null, error: 'Invalid agent bindings row' };
  return { result: toBindings(data), error: null };
}

export interface UpdateBindingsPatch {
  selectedKvStoreId: string | null;
  selectedRagStoreId: string | null;
}

export interface UpdateBindingsResult {
  result: AgentStoreBindings | null;
  error: string | null;
  conflict: boolean;
}

export async function updateAgentStoreBindingsWithPrecondition(
  supabase: SupabaseClient,
  agentId: string,
  expectedUpdatedAt: string,
  patch: UpdateBindingsPatch
): Promise<UpdateBindingsResult> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('agents')
    .update({
      selected_kv_store_id: patch.selectedKvStoreId,
      selected_rag_store_id: patch.selectedRagStoreId,
      updated_at: nowIso,
    })
    .eq('id', agentId)
    .eq('updated_at', expectedUpdatedAt)
    .select('selected_kv_store_id, selected_rag_store_id, updated_at')
    .maybeSingle();
  if (error !== null) return { result: null, error: error.message, conflict: false };
  if (data === null) return { result: null, error: null, conflict: true };
  if (!isBindingsRow(data)) return { result: null, error: 'Invalid agent bindings row', conflict: false };
  return { result: toBindings(data), error: null, conflict: false };
}

export interface AgentRef {
  id: string;
  slug: string;
  name: string;
}

interface AgentRefRow {
  id: string;
  slug: string;
  name: string;
}

function isAgentRefRow(value: unknown): value is AgentRefRow {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as { id?: unknown; slug?: unknown; name?: unknown };
  return typeof r.id === 'string' && typeof r.slug === 'string' && typeof r.name === 'string';
}

type StoreColumn = 'selected_kv_store_id' | 'selected_rag_store_id';

async function findDraftAgentsByColumn(
  supabase: SupabaseClient,
  orgId: string,
  storeId: string,
  column: StoreColumn
): Promise<{ rows: AgentRef[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agents')
    .select('id, slug, name')
    .eq('org_id', orgId)
    .eq(column, storeId);
  if (error !== null) return { rows: [], error: error.message };
  const items: unknown[] = (data as unknown[] | null) ?? [];
  const rows = items.filter(isAgentRefRow).map((r) => ({ id: r.id, slug: r.slug, name: r.name }));
  return { rows, error: null };
}

interface PublishedJoinRow {
  version: number;
  agents: {
    id: string;
    slug: string;
    name: string;
    current_version: number;
    org_id: string;
  } | null;
}

function isPublishedJoinRow(value: unknown): value is PublishedJoinRow {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as { version?: unknown; agents?: unknown };
  if (typeof r.version !== 'number') return false;
  if (r.agents === null) return true;
  if (typeof r.agents !== 'object') return false;
  const a = r.agents as {
    id?: unknown;
    slug?: unknown;
    name?: unknown;
    current_version?: unknown;
    org_id?: unknown;
  };
  return (
    typeof a.id === 'string' &&
    typeof a.slug === 'string' &&
    typeof a.name === 'string' &&
    typeof a.current_version === 'number' &&
    typeof a.org_id === 'string'
  );
}

async function findPublishedAgentsByColumn(
  supabase: SupabaseClient,
  orgId: string,
  storeId: string,
  column: StoreColumn
): Promise<{ rows: AgentRef[]; error: string | null }> {
  const { data, error } = await supabase
    .from('agent_versions')
    .select('version, agents!inner(id, slug, name, current_version, org_id)')
    .eq(column, storeId)
    .eq('agents.org_id', orgId);
  if (error !== null) return { rows: [], error: error.message };
  const items: unknown[] = (data as unknown[] | null) ?? [];
  const rows: AgentRef[] = [];
  for (const item of items) {
    if (!isPublishedJoinRow(item)) continue;
    if (item.agents === null) continue;
    if (item.version !== item.agents.current_version) continue;
    rows.push({ id: item.agents.id, slug: item.agents.slug, name: item.agents.name });
  }
  return { rows, error: null };
}

export interface AgentsByStoreResult {
  draft: AgentRef[];
  published: AgentRef[];
  error: string | null;
}

async function findAgentsByStoreColumn(
  supabase: SupabaseClient,
  orgId: string,
  storeId: string,
  column: StoreColumn
): Promise<AgentsByStoreResult> {
  const [draft, published] = await Promise.all([
    findDraftAgentsByColumn(supabase, orgId, storeId, column),
    findPublishedAgentsByColumn(supabase, orgId, storeId, column),
  ]);
  const err = draft.error ?? published.error;
  if (err !== null) return { draft: [], published: [], error: err };
  return { draft: draft.rows, published: published.rows, error: null };
}

export async function findAgentsByKvStore(
  supabase: SupabaseClient,
  orgId: string,
  storeId: string
): Promise<AgentsByStoreResult> {
  return await findAgentsByStoreColumn(supabase, orgId, storeId, 'selected_kv_store_id');
}

export async function findAgentsByRagStore(
  supabase: SupabaseClient,
  orgId: string,
  storeId: string
): Promise<AgentsByStoreResult> {
  return await findAgentsByStoreColumn(supabase, orgId, storeId, 'selected_rag_store_id');
}
