import { proxyToBackend } from '@/app/lib/backendProxy';

interface RegistryRouteContext {
  params: Promise<{ agentId: string }>;
}

export async function GET(_request: Request, context: RegistryRouteContext): Promise<Response> {
  const { agentId } = await context.params;
  return await proxyToBackend('GET', `/agents/${encodeURIComponent(agentId)}/registry`);
}
