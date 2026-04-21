import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function POST(req: Request): Promise<Response> {
  const body = await req.text();
  const xff = req.headers.get('x-vercel-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const upstream = await fetch(`${API_URL}/auth/public/lookup-email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': xff,
    },
    body,
  });
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
