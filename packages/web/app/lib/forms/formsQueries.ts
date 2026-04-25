import type { OutputSchemaField } from '@daviddh/graph-types';
import {
  applyFormFields,
  type ApplyResult,
  type FormData,
  type FormDefinition,
  type ValidationsMap,
} from '@daviddh/llm-graph-runner';

import { createClient } from '@/app/lib/supabase/server';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

type RpcResult = { data: unknown; error: { message: string } | null };

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
  agent_id: string;
  schema_id: string;
  fields: OutputSchemaField[];
}

interface ConversationMetadataRow {
  metadata: { forms?: Record<string, FormData> } | null;
}

export async function queryFormsForAgent(agentId: string): Promise<FormDefinition[]> {
  const db = await createClient();
  const [forms, schemas] = await Promise.all([
    db
      .from('graph_forms')
      .select('id, agent_id, display_name, form_slug, schema_id, validations')
      .eq('agent_id', agentId),
    db.from('graph_output_schemas').select('agent_id, schema_id, fields').eq('agent_id', agentId),
  ]);
  if (forms.error) throw forms.error;
  if (schemas.error) throw schemas.error;

  const schemaMap = buildSchemaMap((schemas.data ?? []) as unknown as SchemaRow[]);
  const formRows = (forms.data ?? []) as unknown as FormRow[];
  return formRows.map((f) => toFormDefinition(f, schemaMap));
}

function buildSchemaMap(rows: SchemaRow[]): Map<string, OutputSchemaField[]> {
  const map = new Map<string, OutputSchemaField[]>();
  for (const s of rows) map.set(s.schema_id, s.fields);
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

export async function queryFormData(
  conversationId: string,
  formId: string
): Promise<FormData | undefined> {
  const db = await createClient();
  const { data, error } = await db
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  if (error) throw error;
  const row = data as unknown as ConversationMetadataRow | null;
  return row?.metadata?.forms?.[formId];
}

/**
 * Validate-then-write applies all-or-nothing form-field writes.
 * Safe under concurrency for MVP because every validation rule is stateless
 * (only depends on the input value, not on sibling DB state). The merge is a
 * field-level JSONB upsert under a row lock inside `write_form_data`.
 */
export async function applyFormFieldsAtomicQuery(args: ApplyArgs): Promise<ApplyResult> {
  const db = await createClient();
  const current = await queryFormData(args.conversationId, args.form.id);
  const result = applyFormFields({ form: args.form, currentData: current, fields: args.fields });
  if (!result.ok) return result;
  const patch = topLevelDiff(current ?? {}, result.newData);
  const { error } = await callRpc(db, 'write_form_data', {
    p_conversation_id: args.conversationId,
    p_form_id: args.form.id,
    p_new_fields: patch as Json,
  });
  if (error) throw new Error(error.message);
  return result;
}

async function callRpc(
  db: Awaited<ReturnType<typeof createClient>>,
  name: string,
  args: object
): Promise<RpcResult> {
  return (db.rpc as unknown as (n: string, a: object) => Promise<RpcResult>)(name, args);
}

function topLevelDiff(
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(next)) {
    if (!isEqualJson(prev[k], next[k])) out[k] = next[k];
  }
  return out;
}

function isEqualJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
