import { proxyToBackend } from '@/app/lib/backendProxy';

interface VersionsRouteContext {
  params: Promise<{ agentId: string }>;
}

export async function GET(_request: Request, context: VersionsRouteContext): Promise<Response> {
  const { agentId } = await context.params;
  return await proxyToBackend('GET', `/agents/${agentId}/versions`);
}
