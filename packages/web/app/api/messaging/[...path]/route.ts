import { type NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

function forwardHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const apiKey = request.headers.get('api_key');
  if (apiKey) headers.api_key = apiKey;

  const uid = request.headers.get('uid');
  if (uid) headers.uid = uid;

  const auth = request.headers.get('authorization');
  if (auth) headers.Authorization = auth;

  return headers;
}

async function proxyRequest(request: NextRequest, { path }: { path: string[] }): Promise<NextResponse> {
  const backendPath = path.join('/');
  const queryString = request.nextUrl.search;
  const url = `${API_URL}/${backendPath}${queryString}`;

  const init: RequestInit = {
    method: request.method,
    headers: forwardHeaders(request),
  };

  if (request.method !== 'GET') {
    const body = await request.text();
    if (body) init.body = body;
  }

  const upstream = await fetch(url, init);

  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return await proxyRequest(request, await params);
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return await proxyRequest(request, await params);
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return await proxyRequest(request, await params);
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return await proxyRequest(request, await params);
}
