import { proxyToBackend } from '@/app/lib/backendProxy';

interface GraphRouteContext {
  params: Promise<{ agentId: string }>;
}

export async function GET(_request: Request, context: GraphRouteContext): Promise<Response> {
  const { agentId } = await context.params;
  return await proxyToBackend('GET', `/agents/${agentId}/graph`);
}
