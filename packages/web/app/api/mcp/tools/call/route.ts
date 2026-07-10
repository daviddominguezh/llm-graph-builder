import { resolveTransportVariables } from '@/app/lib/resolveVariablesServer';
import { createClient } from '@/app/lib/supabase/server';
import { McpTransportSchema, VariableValueSchema } from '@daviddh/graph-types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

const ToolCallRequestSchema = z.object({
  transport: McpTransportSchema,
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
  variableValues: z.record(z.string(), VariableValueSchema).optional(),
  orgId: z.string().optional(),
  libraryItemId: z.string().optional(),
  agentId: z.string().optional(),
});

type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;

async function resolveOAuthHeaders(
  authHeader: string,
  parsed: ToolCallRequest
): Promise<Record<string, string> | undefined> {
  if (parsed.orgId === undefined || parsed.libraryItemId === undefined) return undefined;
  const res = await fetch(`${API_URL}/agents/mcp-oauth/resolve-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({
      orgId: parsed.orgId,
      libraryItemId: parsed.libraryItemId,
      agentId: parsed.agentId,
      variableValues: parsed.variableValues,
    }),
  });
  if (!res.ok) {
    // DEBUG (remove before merge)
    process.stdout.write(`[toolCall-proxy][DEBUG] resolve-token FAILED status=${String(res.status)}\n`);
    return undefined;
  }
  const data = (await res.json()) as { accessToken?: string };
  // DEBUG (remove before merge)
  process.stdout.write(`[toolCall-proxy][DEBUG] resolve-token ok hasToken=${String(data.accessToken !== undefined)}\n`);
  if (data.accessToken === undefined) return undefined;
  return { Authorization: `Bearer ${data.accessToken}` };
}

interface ProxyContext {
  authHeader: string;
  parsed: ToolCallRequest;
}

/** DEBUG (remove before merge): redacted view of the Authorization header —
 * shows an unresolved `{{var}}` template, a resolved token length, or MISSING. */
function authHeaderPreview(transport: ToolCallRequest['transport']): string {
  if (transport.type !== 'http' && transport.type !== 'sse') return 'n/a';
  const value = transport.headers?.Authorization ?? transport.headers?.authorization ?? '';
  if (value === '' || value === 'Bearer ') return 'MISSING/empty';
  return value.includes('{{') ? `template="${value}"` : `resolved(len=${String(value.length)})`;
}

async function resolveAndProxy(ctx: ProxyContext): Promise<Response> {
  let { transport } = ctx.parsed;
  const authBefore = authHeaderPreview(transport);
  const varKeys =
    ctx.parsed.variableValues !== undefined ? Object.keys(ctx.parsed.variableValues).join(',') : '(none)';

  if (ctx.parsed.variableValues !== undefined) {
    transport = await resolveTransportVariables(transport, ctx.parsed.variableValues);
  }

  const oauthHeaders = await resolveOAuthHeaders(ctx.authHeader, ctx.parsed);
  // DEBUG (remove before merge): is the key present anywhere before we call?
  process.stdout.write(
    `[toolCall-proxy][DEBUG] tool=${ctx.parsed.toolName} varKeys=[${varKeys}] authBefore=${authBefore} authAfter=${authHeaderPreview(transport)} oauthResolved=${String(oauthHeaders !== undefined)}\n`
  );
  if (oauthHeaders !== undefined && (transport.type === 'http' || transport.type === 'sse')) {
    transport = { ...transport, headers: { ...transport.headers, ...oauthHeaders } };
  }

  const upstream = await fetch(`${API_URL}/mcp/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transport, toolName: ctx.parsed.toolName, args: ctx.parsed.args }),
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
  const result = ToolCallRequestSchema.safeParse(raw);
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: HTTP_BAD_REQUEST });
  }

  const session = await supabase.auth.getSession();
  const authHeader = `Bearer ${session.data.session?.access_token ?? ''}`;

  return await resolveAndProxy({ authHeader, parsed: result.data });
}
