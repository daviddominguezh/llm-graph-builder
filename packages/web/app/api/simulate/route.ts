import { getApiKeyValueById } from '@/app/lib/api-keys';
import { resolveTransportVariables } from '@/app/lib/resolve-variables';
import { createClient } from '@/app/lib/supabase/server';
import { McpTransportSchema, VariableValueSchema } from '@daviddh/graph-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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

const McpServerEntrySchema = z
  .object({
    transport: McpTransportSchema,
    variableValues: z.record(z.string(), VariableValueSchema).optional(),
  })
  .passthrough();

async function resolveServerVariables(
  supabase: SupabaseClient,
  server: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const parsed = McpServerEntrySchema.safeParse(server);
  if (!parsed.success) return server;
  const { variableValues } = parsed.data;
  if (variableValues === undefined) return server;
  const resolved = await resolveTransportVariables(supabase, parsed.data.transport, variableValues);
  return { ...server, transport: resolved, variableValues: undefined };
}

async function resolveMcpServersInGraph(supabase: SupabaseClient, graph: unknown): Promise<void> {
  if (typeof graph !== 'object' || graph === null || !('mcpServers' in graph)) return;
  const g = graph as Record<string, unknown>;
  const servers = g.mcpServers;
  if (!Array.isArray(servers)) return;
  g.mcpServers = await Promise.all(
    servers.map((s: unknown) => resolveServerVariables(supabase, s as Record<string, unknown>))
  );
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
  const { body: upstreamBody } = upstream;
  if (upstreamBody === null) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstreamBody, {
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
  await resolveMcpServersInGraph(supabase, rest.graph);
  return await fetchUpstream({ ...rest, apiKey });
}
