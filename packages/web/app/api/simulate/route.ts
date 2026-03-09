import { getApiKeyValueById } from '@/app/lib/api-keys';
import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

interface SimulateBody {
  apiKeyId?: string;
  [key: string]: unknown;
}

function isSimulateBody(value: unknown): value is SimulateBody {
  return typeof value === 'object' && value !== null;
}

async function resolveApiKey(body: SimulateBody): Promise<{ apiKey: string; error: string | null }> {
  const { apiKeyId } = body;
  if (typeof apiKeyId !== 'string' || apiKeyId === '') {
    return { apiKey: '', error: 'Missing apiKeyId' };
  }

  const supabase = await createClient();
  const { value, error } = await getApiKeyValueById(supabase, apiKeyId);
  if (error !== null || value === null) {
    return { apiKey: '', error: error ?? 'API key not found' };
  }

  return { apiKey: value, error: null };
}

export async function POST(request: Request): Promise<Response> {
  const raw: unknown = await request.json();
  if (!isSimulateBody(raw)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: HTTP_BAD_REQUEST });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: HTTP_UNAUTHORIZED });
  }

  const { apiKey, error } = await resolveApiKey(raw);
  if (error !== null) {
    return NextResponse.json({ error }, { status: HTTP_BAD_REQUEST });
  }

  const rest = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== 'apiKeyId'));
  const upstreamBody = { ...rest, apiKey };

  const upstream = await fetch(`${API_URL}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(upstreamBody),
  });

  if (!upstream.ok) {
    return new Response(upstream.body, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
