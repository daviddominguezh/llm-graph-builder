// Supabase Edge Function — Stateless Agent Executor
// Receives complete payload, executes agent, streams SSE events back.
// No DB access, no secrets resolution — all provided in the payload.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Note: @daviddh/llm-graph-runner import path will need adjustment for Deno.
// For now, create the structure and leave a TODO for Deno-compatible import.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface ExecutePayload {
  graph: unknown;
  apiKey: string;
  modelId: string;
  currentNodeId: string;
  messages: unknown[];
  structuredOutputs: Record<string, unknown[]>;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
  sessionID: string;
  tenantID: string;
  userID: string;
  isFirstMessage: boolean;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const payload: ExecutePayload = await req.json();

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        function writeEvent(event: Record<string, unknown>): void {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        try {
          // TODO: Import and use @daviddh/llm-graph-runner when Deno-compatible
          // 1. Build Context from payload
          // 2. Create MCP clients for graph.mcpServers
          // 3. Extract tools -> toolsOverride
          // 4. Call executeWithCallbacks() with:
          //    - onNodeVisited: (nodeId) => writeEvent({ type: 'node_visited', nodeId })
          //    - onNodeProcessed: (event) => writeEvent({ type: 'node_processed', ...event })
          // 5. Write complete event with totals
          // 6. Close MCP clients

          // Placeholder: echo back that the function received the payload
          writeEvent({
            type: 'error',
            message: 'Edge function not yet implemented — use direct execution in Express backend',
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          writeEvent({ type: 'error', message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
