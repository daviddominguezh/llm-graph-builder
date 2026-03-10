import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const HTTP_UNAUTHORIZED = 401;

interface SessionData {
  access_token: string;
}

async function getAccessToken(): Promise<SessionData | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session === null) return null;
  return { access_token: session.access_token };
}

function buildFetchInit(method: string, token: string, body?: unknown): RequestInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return init;
}

export async function proxyToBackend(method: string, backendPath: string, body?: unknown): Promise<Response> {
  const sessionData = await getAccessToken();
  if (sessionData === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: HTTP_UNAUTHORIZED });
  }

  const init = buildFetchInit(method, sessionData.access_token, body);
  const upstream = await fetch(`${API_URL}${backendPath}`, init);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}
