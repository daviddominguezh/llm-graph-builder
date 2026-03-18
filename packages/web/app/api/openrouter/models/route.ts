const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET(): Promise<Response> {
  const upstream = await fetch(`${API_URL}/openrouter/models`);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
