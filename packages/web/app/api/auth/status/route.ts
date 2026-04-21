import { proxyToBackend } from '@/app/lib/backendProxy';

export async function GET(): Promise<Response> {
  return proxyToBackend('GET', '/auth/status');
}
