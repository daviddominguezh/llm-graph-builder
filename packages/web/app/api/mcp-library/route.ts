import { proxyToBackend } from '@/app/lib/backendProxy';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();

  const q = searchParams.get('q');
  const category = searchParams.get('category');
  const limit = searchParams.get('limit');
  const offset = searchParams.get('offset');

  if (q !== null) params.set('q', q);
  if (category !== null) params.set('category', category);
  if (limit !== null) params.set('limit', limit);
  if (offset !== null) params.set('offset', offset);

  const qs = params.toString();
  const path = qs === '' ? '/mcp-library' : `/mcp-library?${qs}`;
  return proxyToBackend('GET', path);
}
