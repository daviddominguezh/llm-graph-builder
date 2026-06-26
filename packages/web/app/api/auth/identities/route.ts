import { proxyToBackend } from '@/app/lib/backendProxy';

export async function GET(): Promise<Response> {
  return await proxyToBackend('GET', '/auth/identities');
}
