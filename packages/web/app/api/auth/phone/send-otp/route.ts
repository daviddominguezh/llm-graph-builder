import { proxyToBackend } from '@/app/lib/backendProxy';

export async function POST(req: Request): Promise<Response> {
  const body: unknown = await req.json();
  return await proxyToBackend('POST', '/auth/phone/send-otp', body);
}
