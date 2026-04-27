import { isValidAgentSlug, isValidTenantSlug } from '@openflow/shared-validation';
import { NextResponse } from 'next/server';

import { corsHeadersFor, preflightResponse } from '../../../_helpers/cors.js';

export const runtime = 'nodejs';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;

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
    return NextResponse.json({ error: 'invalid_slug' }, { status: HTTP_BAD_REQUEST, headers: cors });
  }

  const upstreamUrl = `${BACKEND_URL}/api/chat/latest-version/${tenant}/${agent}`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { cache: 'no-store' });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'upstream_unreachable', upstreamUrl, detail },
      { status: HTTP_BAD_GATEWAY, headers: cors }
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
