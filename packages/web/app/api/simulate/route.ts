import { getApiKeyValueById } from '@/app/lib/api-keys';
import { createClient } from '@/app/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_GATEWAY_TIMEOUT = 504;
const UPSTREAM_TIMEOUT_MS = 30_000;

interface SimulateBody {
  apiKeyId?: string;
  [key: string]: unknown;
}

function isSimulateBody(value: unknown): value is SimulateBody {
  return typeof value === 'object' && value !== null;
}

async function resolveApiKey(
  supabase: SupabaseClient,
  body: SimulateBody
): Promise<{ apiKey: string; error: string | null }> {
  const { apiKeyId } = body;
  if (typeof apiKeyId !== 'string' || apiKeyId === '') {
    return { apiKey: '', error: 'Missing apiKeyId' };
  }

  const { value, error } = await getApiKeyValueById(supabase, apiKeyId);
  if (error !== null || value === null) {
    return { apiKey: '', error: error ?? 'API key not found' };
  }

  return { apiKey: value, error: null };
}

function buildSseStreamResponse(upstream: Response): Response {
  const { console: log } = globalThis;
  log.log(`[SSE:proxy] upstream responded, status=${upstream.status}`);

  const { body: upstreamBody } = upstream;
  if (upstreamBody === null) {
    log.log('[SSE:proxy] upstream body is null');
    return new Response(null, { status: upstream.status });
  }

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      log.log(`[SSE:proxy] forwarding chunk, bytes=${chunk.length}`);
      ctrl.enqueue(chunk);
    },
  });

  void upstreamBody.pipeTo(transform.writable);

  return new Response(transform.readable, {
    status: upstream.status,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}

async function fetchUpstream(body: Record<string, unknown>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${API_URL}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return new Response(upstream.body, { status: upstream.status });
    }

    return buildSseStreamResponse(upstream);
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out' }, { status: HTTP_GATEWAY_TIMEOUT });
    }
    throw err;
  }
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

  const { apiKey, error } = await resolveApiKey(supabase, raw);
  if (error !== null) {
    return NextResponse.json({ error }, { status: HTTP_BAD_REQUEST });
  }

  const rest = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== 'apiKeyId'));
  return await fetchUpstream({ ...rest, apiKey });
}
