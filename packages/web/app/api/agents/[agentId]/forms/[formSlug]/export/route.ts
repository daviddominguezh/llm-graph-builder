import { authorizeFormAccess } from '@/app/lib/forms/authorizeFormAccess';
import { createClient } from '@/app/lib/supabase/server';
import type { OutputSchemaField } from '@daviddh/graph-types';
import {
  ARRAY_EXPANSION_CAP,
  type FormData,
  collectFieldPaths,
  expandArrayColumns,
  formatCsvRow,
  readFormField,
} from '@daviddh/llm-graph-runner';
import type { NextRequest } from 'next/server';

interface RouteParams {
  params: Promise<{ agentId: string; formSlug: string }>;
}

const MAX_RANGE_DAYS = 15;
const PAGE_SIZE = 500;
const MS_PER_DAY = 86_400_000;
const FILENAME_MAX = 200;

export async function GET(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const params = await ctx.params;
  const queryArgs = parseQuery(req);
  if (queryArgs === null) return new Response('missing-params', { status: 400 });
  if (!isValidRange(queryArgs.from, queryArgs.to)) {
    return new Response('invalid-range', { status: 400 });
  }
  const auth = await authorizeFormAccess({
    agentId: params.agentId,
    formSlug: params.formSlug,
    tenantId: queryArgs.tenantId,
  });
  if (!auth.ok) return new Response(auth.reason, { status: auth.status });
  const layout = await loadColumnLayout({
    agentId: params.agentId,
    tenantId: queryArgs.tenantId,
    formId: auth.formId,
    from: queryArgs.from,
    to: queryArgs.to,
  });
  if (!layout) return new Response('schema-not-found', { status: 404 });
  const filename = buildFilename(queryArgs, params.formSlug);
  const stream = buildCsvStream({
    layout,
    formId: auth.formId,
    agentId: params.agentId,
    tenantId: queryArgs.tenantId,
    from: queryArgs.from,
    to: queryArgs.to,
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'x-forms-truncated': layout.truncated ? 'true' : 'false',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

interface QueryArgs {
  tenantId: string;
  tenantSlug: string;
  agentSlug: string;
  from: string;
  to: string;
}

function parseQuery(req: NextRequest): QueryArgs | null {
  const sp = req.nextUrl.searchParams;
  const tenantId = sp.get('tenantId');
  const from = sp.get('from');
  const to = sp.get('to');
  if (tenantId === null || from === null || to === null) return null;
  return {
    tenantId,
    tenantSlug: sp.get('tenantSlug') ?? 'tenant',
    agentSlug: sp.get('agentSlug') ?? 'agent',
    from,
    to,
  };
}

function isValidRange(from: string, to: string): boolean {
  const delta = (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;
  return delta >= 0 && delta <= MAX_RANGE_DAYS;
}

interface ColumnLayout {
  fixedCols: string[];
  dynamicCols: string[];
  schemaFields: OutputSchemaField[];
  truncated: boolean;
}

const FIXED_COLS = ['conversation_id', 'user_name', 'channel', 'started_at', 'last_message_at', 'status'];

interface LoadLayoutArgs {
  agentId: string;
  tenantId: string;
  formId: string;
  from: string;
  to: string;
}

async function loadColumnLayout(args: LoadLayoutArgs): Promise<ColumnLayout | null> {
  const db = await createClient();
  const formRow = await db.from('graph_forms').select('id, schema_id').eq('id', args.formId).maybeSingle();
  if (formRow.error !== null || formRow.data === null) return null;
  const schemaId = (formRow.data as unknown as { schema_id: string }).schema_id;
  const schemaRow = await db
    .from('graph_output_schemas')
    .select('fields')
    .eq('agent_id', args.agentId)
    .eq('schema_id', schemaId)
    .maybeSingle();
  if (schemaRow.error !== null || schemaRow.data === null) return null;
  const schemaFields = (schemaRow.data as unknown as { fields: OutputSchemaField[] }).fields;
  const canonicalPaths = collectFieldPaths(schemaFields);
  const observedMax = await observeArrayLengths({ ...args, paths: canonicalPaths });
  const expanded = expandArrayColumns(canonicalPaths, observedMax);
  return {
    fixedCols: FIXED_COLS,
    dynamicCols: expanded.columns,
    schemaFields,
    truncated: expanded.truncated,
  };
}

interface ObserveArgs extends LoadLayoutArgs {
  paths: string[];
}

async function observeArrayLengths(args: ObserveArgs): Promise<Record<string, number>> {
  const db = await createClient();
  const out: Record<string, number> = {};
  const arrayPaths = args.paths.filter((p) => p.includes('[]'));
  for (const p of arrayPaths) {
    const container = p.split('[')[0] ?? '';
    const result = await callArrayMaxRpc(db, { ...args, container });
    out[p] = Math.min(result, ARRAY_EXPANSION_CAP);
  }
  return out;
}

interface ArrayMaxRpcArgs extends LoadLayoutArgs {
  container: string;
}

type DbClient = Awaited<ReturnType<typeof createClient>>;

async function callArrayMaxRpc(db: DbClient, args: ArrayMaxRpcArgs): Promise<number> {
  const rpc = db.rpc as unknown as (
    name: string,
    body: Record<string, unknown>
  ) => Promise<{ data: unknown }>;
  const r = await rpc('form_array_max_length', {
    p_agent: args.agentId,
    p_tenant: args.tenantId,
    p_from: args.from,
    p_to: args.to,
    p_form_id: args.formId,
    p_container: args.container,
  });
  return Number(r.data ?? 0);
}

interface StreamArgs {
  layout: ColumnLayout;
  formId: string;
  agentId: string;
  tenantId: string;
  from: string;
  to: string;
}

function buildCsvStream(args: StreamArgs): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const headerCells = [...args.layout.fixedCols, ...args.layout.dynamicCols];
      controller.enqueue(encoder.encode(`﻿${formatCsvRow(headerCells)}\n`));
      await streamRows(controller, encoder, args);
      controller.close();
    },
  });
}

interface RowFromDb {
  id: string;
  user_name: string | null;
  channel: string;
  created_at: string;
  last_message_at: string | null;
  status: string;
  metadata: { forms?: Record<string, unknown> } | null;
}

async function streamRows(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  args: StreamArgs
): Promise<void> {
  let cursor: { ts: string; id: string } | null = null;
  for (;;) {
    const batch = await fetchBatch({ ...args, cursor });
    if (batch.length === 0) break;
    for (const row of batch) writeRowIfNonEmpty(controller, encoder, row, args);
    const last = batch[batch.length - 1];
    if (!last) break;
    cursor = { ts: last.created_at, id: last.id };
    if (batch.length < PAGE_SIZE) break;
  }
}

function writeRowIfNonEmpty(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  row: RowFromDb,
  args: StreamArgs
): void {
  const fd = row.metadata?.forms?.[args.formId] as FormData | undefined;
  const dynCells = args.layout.dynamicCols.map((c) => {
    const r = readFormField(fd, c);
    return r.ok && r.value !== undefined ? String(r.value) : '';
  });
  if (dynCells.every((c) => c === '')) return;
  const cells = [
    row.id,
    row.user_name ?? '',
    row.channel,
    row.created_at,
    row.last_message_at ?? '',
    row.status,
    ...dynCells,
  ];
  controller.enqueue(encoder.encode(`${formatCsvRow(cells)}\n`));
}

interface FetchBatchArgs extends StreamArgs {
  cursor: { ts: string; id: string } | null;
}

async function fetchBatch(args: FetchBatchArgs): Promise<RowFromDb[]> {
  const db = await createClient();
  let q = db
    .from('conversations')
    .select('id, channel, created_at, last_message_at, status, metadata')
    .eq('tenant_id', args.tenantId)
    .eq('agent_id', args.agentId)
    .gte('created_at', args.from)
    .lt('created_at', args.to)
    .not(`metadata->forms->${args.formId}`, 'is', null)
    .order('created_at')
    .order('id')
    .limit(PAGE_SIZE);
  if (args.cursor) {
    q = q.or(`created_at.gt.${args.cursor.ts},and(created_at.eq.${args.cursor.ts},id.gt.${args.cursor.id})`);
  }
  const { data } = await q;
  return (data ?? []) as unknown as RowFromDb[];
}

function buildFilename(q: QueryArgs, formSlug: string): string {
  const base = `openflow-${q.tenantSlug}-${q.agentSlug}-${formSlug}-${q.from}-${q.to}.csv`;
  if (base.length <= FILENAME_MAX) return base;
  const hash = simpleHash(base).toString(16).slice(0, 8);
  return `${base.slice(0, FILENAME_MAX - 13)}-${hash}.csv`;
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
