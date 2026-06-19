// Next.js proxy for tool testing.
//
// The proxy is provider-agnostic: it has zero knowledge of specific provider
// ids or tool names. It authenticates the user, gates access by looking up
// the agent under RLS, builds a minimal ExecutePayload, then forwards the
// request to the edge function's /execute-tool endpoint which produces the
// tool dict and runs the requested tool.
import { createClient } from '@/app/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { fetchAgentBinding, fetchDefaultTenantId, verifyTenantInOrg } from './lookups';
import { buildExecuteToolBody } from './payload';
import { type BackendPayload, TestToolRequestSchema, isBackendPayload } from './types';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_INTERNAL = 500;

interface RouteContext {
  params: Promise<{ providerId: string; toolName: string }>;
}

function errorJson(code: string, message: string, status: number): Response {
  const payload: BackendPayload = { ok: false, error: { code, message } };
  return NextResponse.json(payload, { status });
}

interface BindingResolution {
  orgId: string;
  tenantId: string;
  selectedKvStoreId: string | null;
  selectedRagStoreId: string | null;
}

async function resolveAgentContext(
  supabase: SupabaseClient,
  body: { agentId: string; tenantId?: string }
): Promise<BindingResolution | Response> {
  const binding = await fetchAgentBinding(supabase, body.agentId);
  if (binding === null) {
    return errorJson('forbidden', 'Agent not found or not accessible', HTTP_FORBIDDEN);
  }
  const tenantId = await pickTenantId(supabase, body.tenantId, binding.org_id);
  if (tenantId === null) {
    return errorJson('no_tenant', 'No tenant available for this org', HTTP_BAD_REQUEST);
  }
  return {
    orgId: binding.org_id,
    tenantId,
    selectedKvStoreId: binding.selected_kv_store_id,
    selectedRagStoreId: binding.selected_rag_store_id,
  };
}

async function pickTenantId(
  supabase: SupabaseClient,
  requested: string | undefined,
  orgId: string
): Promise<string | null> {
  if (requested !== undefined) {
    const ok = await verifyTenantInOrg(supabase, requested, orgId);
    return ok ? requested : null;
  }
  return await fetchDefaultTenantId(supabase, orgId);
}

interface CallEdgeArgs {
  edgeUrl: string;
  masterKey: string;
  body: Record<string, unknown>;
}

async function callEdgeFunction(args: CallEdgeArgs): Promise<Response> {
  const upstream = await fetch(`${args.edgeUrl}/execute-tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-master-key': args.masterKey },
    body: JSON.stringify(args.body),
  });
  const raw: unknown = await upstream.json().catch(() => null);
  if (!isBackendPayload(raw)) {
    return errorJson('transient', "Couldn't run the tool — try again", HTTP_OK);
  }
  return NextResponse.json(raw, { status: HTTP_OK });
}

async function authenticate(): Promise<SupabaseClient | Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    return errorJson('unauthorized', 'Unauthorized', HTTP_UNAUTHORIZED);
  }
  return supabase;
}

async function parseBody(
  request: Request
): Promise<{ agentId: string; tenantId?: string; args: Record<string, unknown> } | Response> {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = TestToolRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return errorJson('invalid_request', parsed.error.message, HTTP_BAD_REQUEST);
  }
  return parsed.data;
}

interface EdgeEnv {
  edgeUrl: string;
  masterKey: string;
}

function readEdgeEnv(): EdgeEnv | Response {
  const edgeUrl = process.env.SUPABASE_EDGE_FUNCTION_URL ?? '';
  const masterKey = process.env.EDGE_FUNCTION_MASTER_KEY ?? '';
  if (edgeUrl === '' || masterKey === '') {
    return errorJson('internal_error', 'Edge function not configured', HTTP_INTERNAL);
  }
  return { edgeUrl, masterKey };
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const params = await context.params;
  const env = readEdgeEnv();
  if (env instanceof Response) return env;
  const body = await parseBody(request);
  if (body instanceof Response) return body;
  const supabase = await authenticate();
  if (supabase instanceof Response) return supabase;
  const resolution = await resolveAgentContext(supabase, body);
  if (resolution instanceof Response) return resolution;
  const edgeBody = buildExecuteToolBody({
    agentId: body.agentId,
    orgId: resolution.orgId,
    tenantId: resolution.tenantId,
    providerId: params.providerId,
    toolName: params.toolName,
    selectedKvStoreId: resolution.selectedKvStoreId,
    selectedRagStoreId: resolution.selectedRagStoreId,
    args: body.args,
  });
  try {
    return await callEdgeFunction({ edgeUrl: env.edgeUrl, masterKey: env.masterKey, body: edgeBody });
  } catch {
    return errorJson('transient', "Couldn't run the tool — try again", HTTP_OK);
  }
}
