'use server';

import { createClient } from '@/app/lib/supabase/server';
import { type ValidationsMap, slugNormalize } from '@daviddh/llm-graph-runner';
import { revalidatePath } from 'next/cache';

export interface CreateFormInput {
  agentId: string;
  displayName: string;
  slug: string;
  schemaId: string;
  validations: ValidationsMap;
}

interface FormListItem {
  id: string;
  slug: string;
  displayName: string;
  schemaId: string;
}

interface SchemaUsageItem {
  id: string;
  slug: string;
}

interface FormDetail {
  displayName: string;
  slug: string;
  schemaId: string;
  validations: ValidationsMap;
}

interface InsertGraphFormPayload {
  agent_id: string;
  display_name: string;
  form_slug: string;
  schema_id: string;
  validations: ValidationsMap;
}

interface FormListRow {
  id: string;
  form_slug: string;
  display_name: string;
  schema_id: string;
}

interface FormDetailRow {
  display_name: string;
  form_slug: string;
  schema_id: string;
  validations: ValidationsMap | null;
}

interface SchemaUsageRow {
  id: string;
  schema_id: string;
  form_slug: string;
}

interface QueryError {
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

interface CountResult {
  count: number | null;
  error: QueryError | null;
}

// Permissive shape over `db.from('graph_forms')`. The actual Supabase client
// accepts the real values at runtime; the local Database type is empty so we
// expose a typed builder for the operations this file uses.
interface FilterTerminator {
  eq: (col: string, val: string) => Promise<{ error: QueryError | null }>;
}

interface SelectBuilder<Row> {
  eq: (col: string, val: string) => SelectBuilder<Row>;
  order: (col: string, opts: { ascending: boolean }) => Promise<QueryResult<Row[]>>;
  single: () => Promise<QueryResult<Row>>;
  then: <TR1, TR2>(
    onfulfilled: (v: QueryResult<Row[]>) => TR1 | PromiseLike<TR1>,
    onrejected?: (r: unknown) => TR2 | PromiseLike<TR2>
  ) => Promise<TR1 | TR2>;
}

interface CountBuilder {
  eq: (col: string, val: string) => CountBuilder;
  then: <TR1, TR2>(
    onfulfilled: (v: CountResult) => TR1 | PromiseLike<TR1>,
    onrejected?: (r: unknown) => TR2 | PromiseLike<TR2>
  ) => Promise<TR1 | TR2>;
}

interface InsertBuilder {
  select: (cols: string) => { single: () => Promise<QueryResult<{ id: string }>> };
}

interface GraphFormsTable {
  insert: (values: InsertGraphFormPayload) => InsertBuilder;
  update: (values: { validations: ValidationsMap }) => FilterTerminator;
  delete: () => FilterTerminator;
  select(cols: string, opts: { count: 'exact'; head: true }): CountBuilder;
  select(cols: 'id, form_slug, display_name, schema_id'): SelectBuilder<FormListRow>;
  select(cols: 'display_name, form_slug, schema_id, validations'): SelectBuilder<FormDetailRow>;
  select(cols: 'id, schema_id, form_slug'): SelectBuilder<SchemaUsageRow>;
}

type DbClient = Awaited<ReturnType<typeof createClient>>;

function graphForms(db: DbClient): GraphFormsTable {
  return db.from('graph_forms') as unknown as GraphFormsTable;
}

export async function createFormAction(
  input: CreateFormInput
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const slug = slugNormalize(input.slug);
  if (slug === '') return { ok: false, reason: 'invalid-slug' };
  if (input.displayName.trim() === '') return { ok: false, reason: 'invalid-name' };
  const db = await createClient();
  const { data, error } = await graphForms(db)
    .insert({
      agent_id: input.agentId,
      display_name: input.displayName.trim(),
      form_slug: slug,
      schema_id: input.schemaId,
      validations: input.validations,
    })
    .select('id')
    .single();
  if (error !== null || data === null) return { ok: false, reason: error?.message ?? 'no-row' };
  revalidatePath('/orgs');
  return { ok: true, id: data.id };
}

export async function updateFormValidationsAction(
  formId: string,
  validations: ValidationsMap
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = await createClient();
  const { error } = await graphForms(db).update({ validations }).eq('id', formId);
  if (error !== null) return { ok: false, reason: error.message };
  revalidatePath('/orgs');
  return { ok: true };
}

export async function deleteFormAction(
  formId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = await createClient();
  const { error } = await graphForms(db).delete().eq('id', formId);
  if (error !== null) return { ok: false, reason: error.message };
  revalidatePath('/orgs');
  return { ok: true };
}

export async function checkSlugUniqueAction(agentId: string, slug: string): Promise<{ unique: boolean }> {
  const normalized = slugNormalize(slug);
  if (normalized === '') return { unique: false };
  const db = await createClient();
  const { count, error } = await graphForms(db)
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('form_slug', normalized);
  if (error !== null) throw new Error(error.message);
  return { unique: (count ?? 0) === 0 };
}

export async function listFormsAction(agentId: string): Promise<FormListItem[]> {
  const db = await createClient();
  const { data, error } = await graphForms(db)
    .select('id, form_slug, display_name, schema_id')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true });
  if (error !== null) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    slug: r.form_slug,
    displayName: r.display_name,
    schemaId: r.schema_id,
  }));
}

export async function getFormAction(formId: string): Promise<FormDetail | null> {
  const db = await createClient();
  const { data, error } = await graphForms(db)
    .select('display_name, form_slug, schema_id, validations')
    .eq('id', formId)
    .single();
  if (error !== null || data === null) return null;
  return {
    displayName: data.display_name,
    slug: data.form_slug,
    schemaId: data.schema_id,
    validations: data.validations ?? {},
  };
}

export async function listSchemasUsingFormsAction(
  agentId: string
): Promise<Record<string, SchemaUsageItem[]>> {
  const db = await createClient();
  const { data, error } = await graphForms(db).select('id, schema_id, form_slug').eq('agent_id', agentId);
  if (error !== null) throw new Error(error.message);
  const map: Record<string, SchemaUsageItem[]> = {};
  for (const r of data ?? []) {
    if (map[r.schema_id] === undefined) map[r.schema_id] = [];
    map[r.schema_id]?.push({ id: r.id, slug: r.form_slug });
  }
  return map;
}
