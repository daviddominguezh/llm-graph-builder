import { proxyToBackend } from '@/app/lib/backendProxy';

interface RestoreRouteContext {
  params: Promise<{ agentId: string; version: string }>;
}

export async function POST(_request: Request, context: RestoreRouteContext): Promise<Response> {
  const { agentId, version } = await context.params;
  return await proxyToBackend('POST', `/agents/${agentId}/versions/${version}/restore`);
}
