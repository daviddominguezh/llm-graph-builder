import { proxyToBackend } from '@/app/lib/backendProxy';

interface VersionRouteContext {
  params: Promise<{ agentId: string; version: string }>;
}

export async function GET(_request: Request, context: VersionRouteContext): Promise<Response> {
  const { agentId, version } = await context.params;
  return await proxyToBackend('GET', `/agents/${agentId}/versions/${version}`);
}
