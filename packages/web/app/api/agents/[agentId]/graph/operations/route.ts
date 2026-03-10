import { proxyToBackend } from '@/app/lib/backendProxy';

interface OperationsRouteContext {
  params: Promise<{ agentId: string }>;
}

export async function POST(request: Request, context: OperationsRouteContext): Promise<Response> {
  const { agentId } = await context.params;
  const body: unknown = await request.json();
  return await proxyToBackend('POST', `/agents/${agentId}/graph/operations`, body);
}
