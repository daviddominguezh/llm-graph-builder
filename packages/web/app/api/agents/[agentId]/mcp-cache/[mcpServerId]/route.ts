import { proxyToBackend } from '@/app/lib/backendProxy';

interface McpCacheRouteContext {
  params: Promise<{ agentId: string; mcpServerId: string }>;
}

export async function DELETE(_request: Request, context: McpCacheRouteContext): Promise<Response> {
  const { agentId, mcpServerId } = await context.params;
  return await proxyToBackend(
    'DELETE',
    `/agents/${encodeURIComponent(agentId)}/mcp-cache/${encodeURIComponent(mcpServerId)}`
  );
}
