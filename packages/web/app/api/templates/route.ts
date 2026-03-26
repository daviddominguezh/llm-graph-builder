import { proxyToBackend } from '@/app/lib/backendProxy';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();

  const search = searchParams.get('search');
  const category = searchParams.get('category');
  const sort = searchParams.get('sort');
  const limit = searchParams.get('limit');
  const offset = searchParams.get('offset');

  if (search !== null) params.set('search', search);
  if (category !== null) params.set('category', category);
  if (sort !== null) params.set('sort', sort);
  if (limit !== null) params.set('limit', limit);
  if (offset !== null) params.set('offset', offset);

  const qs = params.toString();
  const path = qs === '' ? '/templates' : `/templates?${qs}`;
  return proxyToBackend('GET', path);
}
