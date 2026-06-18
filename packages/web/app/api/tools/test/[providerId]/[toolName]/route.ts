import { createClient } from '@/app/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { fetchAgentBinding, fetchDefaultTenantId, verifyTenantInOrg } from './lookups';
import { buildBackendBody, resolveBackendPath } from './routing';
import {
  type BackendPayload,
  type BuiltinProviderId,
  TestToolRequestSchema,
  isBackendPayload,
  isBuiltinProviderId,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

interface RouteContext {
  params: Promise<{ providerId: string; toolName: string }>;
}

interface ValidatedRoute {
  provider: BuiltinProviderId;
  toolName: string;
  backendPath: string;
}

function errorJson(code: string, message: string, status: number): Response {
  const payload: BackendPayload = { ok: false, error: { code, message } };
  return NextResponse.json(payload, { status });
}

function validateRoute(params: { providerId: string; toolName: string }): ValidatedRoute | Response {
  if (!isBuiltinProviderId(params.providerId)) {
    return errorJson('unsupported_provider', "Testing this provider isn't supported yet.", HTTP_BAD_REQUEST);
  }
  const backendPath = resolveBackendPath(params.providerId, params.toolName);
  if (backendPath === null) {
    return errorJson('unsupported_provider', "Testing this provider isn't supported yet.", HTTP_BAD_REQUEST);
  }
  return { provider: params.providerId, toolName: params.toolName, backendPath };
}

interface BindingResolution {
  storeId: string;
  tenantId: string;
}

async function resolveBindingAndTenant(
  supabase: SupabaseClient,
  body: { agentId: string; tenantId?: string },
  provider: BuiltinProviderId
): Promise<BindingResolution | Response> {
  const binding = await fetchAgentBinding(supabase, body.agentId);
  if (binding === null) {
    return errorJson('forbidden', 'Agent not found or not accessible', HTTP_FORBIDDEN);
  }
  const storeId = provider === 'kv_store' ? binding.selected_kv_store_id : binding.selected_rag_store_id;
  if (storeId === null) {
    return errorJson('no_store_bound', 'Bind a store for this provider first.', HTTP_BAD_REQUEST);
  }
  const tenantId = await pickTenantId(supabase, body.tenantId, binding.org_id);
  if (tenantId === null) {
    return errorJson('no_tenant', 'No tenant available for this org', HTTP_BAD_REQUEST);
  }
  return { storeId, tenantId };
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

async function callBackend(backendPath: string, body: Record<string, unknown>): Promise<Response> {
  const masterKey = process.env.EDGE_FUNCTION_MASTER_KEY ?? '';
  if (masterKey === '') {
    return errorJson('internal_error', 'Backend not configured', HTTP_OK);
  }
  const upstream = await fetch(`${API_URL}${backendPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-master-key': masterKey },
    body: JSON.stringify(body),
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

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const params = await context.params;
  const route = validateRoute(params);
  if (route instanceof Response) return route;
  const body = await parseBody(request);
  if (body instanceof Response) return body;
  const supabase = await authenticate();
  if (supabase instanceof Response) return supabase;
  const resolution = await resolveBindingAndTenant(supabase, body, route.provider);
  if (resolution instanceof Response) return resolution;
  const backendBody = buildBackendBody(
    route.provider,
    route.toolName,
    resolution.tenantId,
    resolution.storeId,
    body.args
  );
  try {
    return await callBackend(route.backendPath, backendBody);
  } catch {
    return errorJson('transient', "Couldn't run the tool — try again", HTTP_OK);
  }
}
