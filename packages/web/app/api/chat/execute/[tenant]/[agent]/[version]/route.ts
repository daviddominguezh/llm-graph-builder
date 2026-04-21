import { isValidAgentSlug, isValidTenantSlug } from '@openflow/shared-validation';
import { NextResponse } from 'next/server';

import { corsHeadersFor, preflightResponse } from '../../../../_helpers/cors.js';

export const runtime = 'nodejs';

const BACKEND_URL = process.env['BACKEND_URL'] ?? 'http://localhost:4000';
const MOCK_EXECUTE = process.env['MOCK_EXECUTE_PATH'] ?? '/api/mock-execute';
const VERSION_REGEX = /^\d{1,6}$/v;

const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;

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

function validateTenantIdMatch(body: unknown, tenant: string): boolean {
  if (typeof body !== 'object' || body === null) return false;
  if (!('tenantId' in body)) return false;
  return body.tenantId === tenant;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ tenant: string; agent: string; version: string }> }
): Promise<Response> {
  const origin = request.headers.get('origin');
  const cors = corsHeadersFor(origin);
  const { tenant, agent, version } = await context.params;

  if (!isValidTenantSlug(tenant) || !isValidAgentSlug(agent) || !VERSION_REGEX.test(version)) {
    return NextResponse.json({ error: 'Invalid path params' }, { status: HTTP_BAD_REQUEST, headers: cors });
  }

  const bodyText = await request.text();
  const parsed = parseJsonBody(bodyText);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: HTTP_BAD_REQUEST, headers: cors });
  }

  if (!validateTenantIdMatch(parsed.value, tenant)) {
    return NextResponse.json(
      { error: 'tenantId in body must match tenant in URL' },
      { status: HTTP_BAD_REQUEST, headers: cors }
    );
  }

  const upstream = await fetch(`${BACKEND_URL}${MOCK_EXECUTE}/${agent}/${version}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyText,
  });

  if (upstream.body === null) {
    return new Response('upstream returned no body', { status: HTTP_BAD_GATEWAY, headers: cors });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...cors,
      'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'Cache-Control': 'no-store',
    },
  });
}
