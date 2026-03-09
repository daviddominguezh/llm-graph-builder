import { proxyToBackend } from '@/app/lib/backendProxy';

interface PublishRouteContext {
  params: Promise<{ agentId: string }>;
}

export async function POST(_request: Request, context: PublishRouteContext): Promise<Response> {
  const { agentId } = await context.params;
  return await proxyToBackend('POST', `/agents/${agentId}/publish`);
}
