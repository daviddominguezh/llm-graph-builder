import type { OutputSchemaField } from '@daviddh/graph-types';
import type { FormData, FormDefinition, ValidationsMap } from '@daviddh/llm-graph-runner';

import { createClient } from '@/app/lib/supabase/server';

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
