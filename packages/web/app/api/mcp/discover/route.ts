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
  orgId: z.string().optional(),
  libraryItemId: z.string().optional(),
});

type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;
type SupabaseClientType = Awaited<ReturnType<typeof createClient>>;

async function resolveOAuthHeaders(
  authHeader: string,
  parsed: DiscoverRequest
): Promise<Record<string, string> | undefined> {
  if (parsed.orgId === undefined || parsed.libraryItemId === undefined) return undefined;
  const res = await fetch(`${API_URL}/agents/mcp-oauth/resolve-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({ orgId: parsed.orgId, libraryItemId: parsed.libraryItemId }),
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { accessToken?: string };
  if (data.accessToken === undefined) return undefined;
  return { Authorization: `Bearer ${data.accessToken}` };
}

interface ProxyContext {
  supabase: SupabaseClientType;
  authHeader: string;
  parsed: DiscoverRequest;
}

async function resolveAndProxy(ctx: ProxyContext): Promise<Response> {
  let { transport } = ctx.parsed;

  if (ctx.parsed.variableValues !== undefined) {
    transport = await resolveTransportVariables(ctx.supabase, transport, ctx.parsed.variableValues);
  }

  const oauthHeaders = await resolveOAuthHeaders(ctx.authHeader, ctx.parsed);
  if (oauthHeaders !== undefined && (transport.type === 'http' || transport.type === 'sse')) {
    transport = { ...transport, headers: { ...transport.headers, ...oauthHeaders } };
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

  const session = await supabase.auth.getSession();
  const authHeader = `Bearer ${session.data.session?.access_token ?? ''}`;

  return resolveAndProxy({ supabase, authHeader, parsed: result.data });
}
