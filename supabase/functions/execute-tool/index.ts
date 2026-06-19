// Supabase Edge Function — Stateless single-tool runner.
//
// Sibling of `execute-agent`. Reuses the exact same provider/registry/tool
// pipeline (via the shared `../execute-agent/toolBuilder.ts`) so the tool
// surface is identical to what an LLM would see, then executes a single
// tool the caller picks by `(providerId, toolName)` — no LLM loop, no
// streaming, no provider-specific code path here.
//
// Contract:
//   Request body: { payload: ExecutePayload, providerId, toolName, args }
//   Response 200: { ok: true, result }
//             404: { ok: false, error: { code: 'unknown_tool', message } }
//             other: { ok: false, error: { code, message } }
//
// Auth: same `x-master-key: EDGE_FUNCTION_MASTER_KEY` header as execute-agent.
import { ToolError, namespaceToolName } from '@daviddh/llm-graph-runner';
import type { Tool } from 'ai';

import {
  type ExecutePayload,
  buildSupabaseClient,
  buildToolsForAgentV2,
  prepareAllBundles,
} from '../execute-agent/toolBuilder.ts';

const JSON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-master-key',
  'Content-Type': 'application/json',
};

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;

/* ─── Logging ─── */

const log = {
  info: (msg: string) => console.info(`[edge:execute-tool] ${msg}`),
  error: (msg: string) => console.error(`[edge:execute-tool] ${msg}`),
};

/* ─── Auth ─── */

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let mismatch = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    mismatch |= bufA[i]! ^ bufB[i]!;
  }
  return mismatch === 0;
}

function authenticateRequest(req: Request): Response | null {
  const masterKey = Deno.env.get('EDGE_FUNCTION_MASTER_KEY');
  if (masterKey === undefined || masterKey === '') {
    return jsonResponse({ ok: false, error: { code: 'misconfigured', message: 'Server misconfigured' } }, HTTP_INTERNAL);
  }
  const token = req.headers.get('x-master-key') ?? '';
  if (token === '' || !timingSafeEqual(token, masterKey)) {
    return jsonResponse({ ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } }, HTTP_UNAUTHORIZED);
  }
  return null;
}

/* ─── Response helpers ─── */

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

interface RequestBody {
  payload: ExecutePayload;
  providerId: string;
  toolName: string;
  args: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseRequestBody(raw: unknown): RequestBody | null {
  if (!isRecord(raw)) return null;
  if (!isRecord(raw.payload)) return null;
  if (typeof raw.providerId !== 'string' || raw.providerId === '') return null;
  if (typeof raw.toolName !== 'string' || raw.toolName === '') return null;
  return {
    payload: raw.payload as unknown as ExecutePayload,
    providerId: raw.providerId,
    toolName: raw.toolName,
    args: raw.args,
  };
}

/* ─── Tool execution ─── */

function pickTool(tools: Record<string, Tool>, providerId: string, toolName: string): Tool | null {
  const key = namespaceToolName(providerId, toolName);
  return tools[key] ?? null;
}

interface ExecOk {
  ok: true;
  result: unknown;
}

interface ExecErr {
  ok: false;
  error: { code: string; message: string };
}

type ExecOutcome = ExecOk | ExecErr;

async function runTool(tool: Tool, args: unknown): Promise<ExecOutcome> {
  try {
    if (tool.execute === undefined) {
      return { ok: false, error: { code: 'no_executor', message: 'Tool has no execute()' } };
    }
    // The AI SDK's Tool.execute signature requires an options arg; we pass a
    // minimal shape (no toolCallId / no messages) because this path runs outside
    // an LLM loop. Tools that read those fields will see undefineds; the
    // builtin tools we ship don't.
    const result = await tool.execute(args, {
      toolCallId: 'test',
      messages: [],
    } as unknown as Parameters<NonNullable<typeof tool.execute>>[1]);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ToolError) {
      return { ok: false, error: { code: err.code, message: err.message } };
    }
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    return { ok: false, error: { code: 'internal_error', message } };
  }
}

interface HandleArgs {
  body: RequestBody;
}

async function handleExecute(args: HandleArgs): Promise<Response> {
  const { body } = args;
  const supabase = await buildSupabaseClient();
  const bundles = await prepareAllBundles(body.payload, supabase);
  const tools = await buildToolsForAgentV2({
    payload: body.payload,
    conversationId: body.payload.conversationId,
    bundles,
  });
  const tool = pickTool(tools, body.providerId, body.toolName);
  if (tool === null) {
    log.info(`unknown_tool ${body.providerId}__${body.toolName}`);
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'unknown_tool',
          message: `Tool ${body.providerId}__${body.toolName} not found`,
        },
      },
      HTTP_NOT_FOUND
    );
  }
  log.info(`exec ${body.providerId}__${body.toolName}`);
  const outcome = await runTool(tool, body.args);
  return jsonResponse(outcome, HTTP_OK);
}

/* ─── Main handler ─── */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: JSON_HEADERS });
  }

  const authError = authenticateRequest(req);
  if (authError !== null) return authError;

  const raw: unknown = await req.json().catch(() => null);
  const body = parseRequestBody(raw);
  if (body === null) {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'invalid_request', message: 'Body must be { payload, providerId, toolName, args }' },
      },
      HTTP_BAD_REQUEST
    );
  }

  try {
    return await handleExecute({ body });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Execution failed';
    log.error(message);
    return jsonResponse({ ok: false, error: { code: 'internal_error', message } }, HTTP_INTERNAL);
  }
});
