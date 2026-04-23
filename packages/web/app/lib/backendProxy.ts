import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';
import { cache } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const HTTP_UNAUTHORIZED = 401;

interface SessionData {
  access_token: string;
}

const getAccessToken = cache(async (): Promise<SessionData | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session === null) return null;
  return { access_token: session.access_token };
});

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

  const headers = new Headers(upstream.headers);
  // fetch() already decoded the body; strip encoding/length so the browser
  // doesn't try to gunzip plain bytes (ERR_CONTENT_DECODING_FAILED).
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('transfer-encoding');

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function fetchFromBackend(
  method: string,
  backendPath: string,
  body?: unknown
): Promise<unknown> {
  const sessionData = await getAccessToken();
  if (sessionData === null) {
    throw new Error('Unauthorized');
  }

  const init = buildFetchInit(method, sessionData.access_token, body);
  const res = await fetch(`${API_URL}${backendPath}`, init);

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Backend request failed (${String(res.status)}): ${text}`);
  }

  const text = await res.text();
  return JSON.parse(text) as unknown;
}

export async function uploadToBackend(backendPath: string, formData: FormData): Promise<unknown> {
  const sessionData = await getAccessToken();
  if (sessionData === null) {
    throw new Error('Unauthorized');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${sessionData.access_token}`,
  };

  const res = await fetch(`${API_URL}${backendPath}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Backend upload failed (${String(res.status)}): ${text}`);
  }

  const text = await res.text();
  return JSON.parse(text) as unknown;
}
