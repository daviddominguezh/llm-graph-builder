// Portable port of web `app/lib/forms/formsQueries.ts`: the injected
// `SupabaseClient` replaces `await createClient()` so these helpers run on Node,
// Workers and Deno. Supabase rows are validated through type guards (the
// lint-clean idiom from kvQueries) instead of `as unknown as` assertions, but
// behaviour is otherwise identical to the edge source.
import {
  type ApplyResult,
  type FailedAttempt,
  type FormData,
  type FormDefinition,
  type ValidationsMap,
  applyFormFields,
} from '@daviddh/llm-graph-runner';
import type { SupabaseClient } from '@supabase/supabase-js';

// `OutputSchemaField` is the element type of `FormDefinition.schemaFields`,
// derived from the runner so the package needs no direct `@daviddh/graph-types`
// dependency.
type OutputSchemaField = FormDefinition['schemaFields'][number];

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

interface ApplyArgs {
  conversationId: string;
  form: FormDefinition;
  fields: Array<{ fieldPath: string; fieldValue: unknown }>;
}

interface FormRow {
  id: string;
  agent_id: string;
  display_name: string;
  form_slug: string;
  schema_id: string;
  validations: ValidationsMap;
}

interface SchemaRow {
  schema_id: string;
  fields: OutputSchemaField[];
}

function isFormRow(value: unknown): value is FormRow {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as {
    id?: unknown;
    agent_id?: unknown;
    display_name?: unknown;
    form_slug?: unknown;
    schema_id?: unknown;
    validations?: unknown;
  };
  const strings =
    typeof r.id === 'string' &&
    typeof r.agent_id === 'string' &&
    typeof r.display_name === 'string' &&
    typeof r.form_slug === 'string' &&
    typeof r.schema_id === 'string';
  return strings && typeof r.validations === 'object' && r.validations !== null;
}

function isSchemaRow(value: unknown): value is SchemaRow {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as { schema_id?: unknown; fields?: unknown };
  return typeof r.schema_id === 'string' && Array.isArray(r.fields);
}

function mapFormRows(data: unknown): FormRow[] {
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.filter(isFormRow);
}

function buildSchemaMap(data: unknown): Map<string, OutputSchemaField[]> {
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const map = new Map<string, OutputSchemaField[]>();
  for (const s of rows) if (isSchemaRow(s)) map.set(s.schema_id, s.fields);
  return map;
}

function toFormDefinition(f: FormRow, schemaMap: Map<string, OutputSchemaField[]>): FormDefinition {
  return {
    id: f.id,
    agentId: f.agent_id,
    displayName: f.display_name,
    formSlug: f.form_slug,
    schemaId: f.schema_id,
    schemaFields: schemaMap.get(f.schema_id) ?? [],
    validations: f.validations,
  };
}

export async function queryFormsForAgent(
  supabase: SupabaseClient,
  agentId: string
): Promise<FormDefinition[]> {
  const [forms, schemas] = await Promise.all([
    supabase
      .from('graph_forms')
      .select('id, agent_id, display_name, form_slug, schema_id, validations')
      .eq('agent_id', agentId),
    supabase.from('graph_output_schemas').select('agent_id, schema_id, fields').eq('agent_id', agentId),
  ]);
  if (forms.error !== null) throw forms.error;
  if (schemas.error !== null) throw schemas.error;

  const schemaMap = buildSchemaMap(schemas.data);
  return mapFormRows(forms.data).map((f) => toFormDefinition(f, schemaMap));
}

function readForms(data: unknown): Record<string, FormData> | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const r = data as { metadata?: { forms?: Record<string, FormData> } | null };
  return r.metadata?.forms;
}

export async function queryFormData(
  supabase: SupabaseClient,
  conversationId: string,
  formId: string
): Promise<FormData | undefined> {
  const { data, error } = await supabase
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  if (error !== null) throw error;
  return readForms(data)?.[formId];
}

/**
 * Validate-then-write applies all-or-nothing form-field writes.
 * Safe under concurrency for MVP because every validation rule is stateless
 * (only depends on the input value, not on sibling DB state). The merge is a
 * field-level JSONB upsert under a row lock inside `write_form_data`.
 */
export async function applyFormFieldsAtomicQuery(
  supabase: SupabaseClient,
  args: ApplyArgs
): Promise<ApplyResult> {
  const current = await queryFormData(supabase, args.conversationId, args.form.id);
  const result = applyFormFields({ form: args.form, currentData: current, fields: args.fields });
  if (!result.ok) return result;
  const patch = topLevelDiff(current ?? {}, result.newData);
  const { error } = await callRpc(supabase, 'write_form_data', {
    p_conversation_id: args.conversationId,
    p_form_id: args.form.id,
    p_new_fields: patch,
  });
  if (error !== null) throw new Error(error.message);
  return result;
}

export async function recordFailedAttemptQuery(
  supabase: SupabaseClient,
  conversationId: string,
  formId: string,
  attempt: FailedAttempt
): Promise<void> {
  const result = await callRpc(supabase, 'append_form_failure', {
    p_conversation_id: conversationId,
    p_form_id: formId,
    p_entry: attempt,
  });
  if (result.error !== null) throw new Error(result.error.message);
}

function toRpcResult(response: unknown): RpcResult {
  if (typeof response !== 'object' || response === null) return { data: null, error: null };
  const r = response as { data?: unknown; error?: { message?: unknown } | null };
  const { error } = r;
  if (error !== null && error !== undefined && typeof error.message === 'string') {
    return { data: r.data ?? null, error: { message: error.message } };
  }
  return { data: r.data ?? null, error: null };
}

async function callRpc(supabase: SupabaseClient, name: string, args: object): Promise<RpcResult> {
  // supabase-js types rpc's awaited result as `any` without a Database generic;
  // funnel it through `unknown` and validate to keep the lint boundary clean.
  const response: unknown = await supabase.rpc(name, args);
  return toRpcResult(response);
}

function topLevelDiff(prev: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, value] of Object.entries(next)) {
    if (!isEqualJson(prev[k], value)) out[k] = value;
  }
  return out;
}

function isEqualJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
