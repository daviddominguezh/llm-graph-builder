import { proxyToBackend } from '@/app/lib/backendProxy';

export async function POST(): Promise<Response> {
  return await proxyToBackend('POST', '/auth/public/handle-oauth-duplicate');
}
