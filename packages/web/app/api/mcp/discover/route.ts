import { resolveTransportVariables } from '@/app/lib/resolve-variables';
import { createClient } from '@/app/lib/supabase/server';
import { McpTransportSchema, VariableValueSchema } from '@daviddh/graph-types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

const DiscoverRequestSchema = z.object({
  transport: McpTransportSchema,
  variableValues: z.record(z.string(), VariableValueSchema).optional(),
});

type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;
type SupabaseClientType = Awaited<ReturnType<typeof createClient>>;

async function resolveAndProxy(supabase: SupabaseClientType, parsed: DiscoverRequest): Promise<Response> {
  let transport = parsed.transport;

  if (parsed.variableValues !== undefined) {
    transport = await resolveTransportVariables(supabase, transport, parsed.variableValues);
  }

  const upstream = await fetch(`${API_URL}/mcp/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transport }),
  });

  const data: unknown = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: HTTP_UNAUTHORIZED });
  }

  const raw: unknown = await request.json();
  const result = DiscoverRequestSchema.safeParse(raw);
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: HTTP_BAD_REQUEST });
  }

  return resolveAndProxy(supabase, result.data);
}
