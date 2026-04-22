import { createServiceRoleClient } from '@/app/lib/supabase/service';
import { isValidAgentSlug, isValidTenantSlug } from '@openflow/shared-validation';
import { NextResponse } from 'next/server';

import { corsHeadersFor, preflightResponse } from '../../../../_helpers/cors.js';
import { resolveWidgetTarget } from './widgetKey.js';

export const runtime = 'nodejs';

const BACKEND_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
const VERSION_REGEX = /^\d{1,6}$/v;

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_BAD_GATEWAY = 502;
const HTTP_INTERNAL_ERROR = 500;

export function OPTIONS(request: Request): Response {
  return preflightResponse(request);
}

function parseJsonBody(bodyText: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(bodyText) };
  } catch {
    return { ok: false };
  }
}

function buildExecuteBody(raw: unknown, resolvedTenantId: string): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? { ...(raw as Record<string, unknown>) } : {};
  base['tenantId'] = resolvedTenantId;
  base['channel'] = 'web';
  return base;
}

interface RouteParams {
  tenant: string;
  agent: string;
  version: string;
}

function validateParams(params: RouteParams): boolean {
  return (
    isValidTenantSlug(params.tenant) && isValidAgentSlug(params.agent) && VERSION_REGEX.test(params.version)
  );
}

async function forwardExecute(
  upstreamUrl: string,
  body: Record<string, unknown>,
  token: string,
  origin: string | null
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (origin !== null) headers['Origin'] = origin;
  return await fetch(upstreamUrl, { method: 'POST', headers, body: JSON.stringify(body) });
}

interface HandlePostArgs {
  params: RouteParams;
  origin: string | null;
  cors: Record<string, string>;
  rawBody: unknown;
}

async function resolveAndForward(args: HandlePostArgs): Promise<Response> {
  const supabase = createServiceRoleClient();
  const resolved = await resolveWidgetTarget(supabase, args.params.tenant, args.params.agent);
  if (resolved === null) {
    return NextResponse.json(
      { error: 'widget_not_published' },
      { status: HTTP_NOT_FOUND, headers: args.cors }
    );
  }
  const body = buildExecuteBody(args.rawBody, resolved.tenantId);
  const upstreamUrl = `${BACKEND_URL}/api/agents/${args.params.agent}/${args.params.version}`;
  try {
    const upstream = await forwardExecute(upstreamUrl, body, resolved.widgetToken, args.origin);
    if (upstream.body === null) {
      return new Response('upstream returned no body', { status: HTTP_BAD_GATEWAY, headers: args.cors });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...args.cors,
        'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'upstream_unreachable', upstreamUrl, detail },
      { status: HTTP_BAD_GATEWAY, headers: args.cors }
    );
  }
}

async function handlePost(
  request: Request,
  context: { params: Promise<{ tenant: string; agent: string; version: string }> },
  cors: Record<string, string>
): Promise<Response> {
  const origin = request.headers.get('origin');
  const params = await context.params;

  if (!validateParams(params)) {
    return NextResponse.json({ error: 'Invalid path params' }, { status: HTTP_BAD_REQUEST, headers: cors });
  }

  const bodyText = await request.text();
  const parsed = parseJsonBody(bodyText);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: HTTP_BAD_REQUEST, headers: cors });
  }

  return await resolveAndForward({ params, origin, cors, rawBody: parsed.value });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ tenant: string; agent: string; version: string }> }
): Promise<Response> {
  const cors = corsHeadersFor(request.headers.get('origin'));
  try {
    return await handlePost(request, context, cors);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[execute route] unhandled error:', detail);
    return NextResponse.json(
      { error: 'internal_error', detail },
      { status: HTTP_INTERNAL_ERROR, headers: cors }
    );
  }
}
