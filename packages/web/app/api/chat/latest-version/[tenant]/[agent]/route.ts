import { isValidAgentSlug, isValidTenantSlug } from '@openflow/shared-validation';
import { NextResponse } from 'next/server';

import { corsHeadersFor, preflightResponse } from '../../../_helpers/cors.js';

export const runtime = 'nodejs';

const BACKEND_URL = process.env['BACKEND_URL'] ?? 'http://localhost:4000';
const MOCK_LATEST = process.env['MOCK_LATEST_PATH'] ?? '/api/mock-execute';

export function OPTIONS(request: Request): Response {
  return preflightResponse(request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ tenant: string; agent: string }> }
): Promise<Response> {
  const origin = request.headers.get('origin');
  const { tenant, agent } = await context.params;

  if (!isValidTenantSlug(tenant) || !isValidAgentSlug(agent)) {
    return NextResponse.json(
      { error: 'Invalid tenant or agent slug' },
      { status: 400, headers: corsHeadersFor(origin) }
    );
  }

  const upstream = await fetch(`${BACKEND_URL}${MOCK_LATEST}/${agent}/latest`, { cache: 'no-store' });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      ...corsHeadersFor(origin),
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
