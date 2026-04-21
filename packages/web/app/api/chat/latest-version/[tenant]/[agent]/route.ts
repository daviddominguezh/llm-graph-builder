import { isValidAgentSlug, isValidTenantSlug } from '@openflow/shared-validation';
import { NextResponse } from 'next/server';

import { corsHeadersFor, preflightResponse } from '../../../_helpers/cors.js';

export const runtime = 'nodejs';

const BACKEND_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
const MOCK_LATEST = process.env['MOCK_LATEST_PATH'] ?? '/api/mock-execute';

export function OPTIONS(request: Request): Response {
  return preflightResponse(request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ tenant: string; agent: string }> }
): Promise<Response> {
  const origin = request.headers.get('origin');
  const cors = corsHeadersFor(origin);
  const { tenant, agent } = await context.params;

  if (!isValidTenantSlug(tenant) || !isValidAgentSlug(agent)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400, headers: cors });
  }

  const upstreamUrl = `${BACKEND_URL}${MOCK_LATEST}/${agent}/latest`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { cache: 'no-store' });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'upstream_unreachable', upstreamUrl, detail },
      { status: 502, headers: cors }
    );
  }

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      ...cors,
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
