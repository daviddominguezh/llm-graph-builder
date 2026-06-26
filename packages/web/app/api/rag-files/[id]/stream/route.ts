import { createClient } from '@/app/lib/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const HTTP_UNAUTHORIZED = 401;
const HTTP_INTERNAL_ERROR = 500;
const HTTP_BAD_REQUEST = 400;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const storeId = req.nextUrl.searchParams.get('storeId') ?? '';
  if (storeId === '') {
    return NextResponse.json({ error: 'storeId required' }, { status: HTTP_BAD_REQUEST });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: HTTP_UNAUTHORIZED });
  }

  const upstream = await fetch(
    `${API_URL}/rag-stores/${encodeURIComponent(storeId)}/files/${encodeURIComponent(id)}/stream`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );
  if (upstream.body === null) {
    return NextResponse.json({ error: 'upstream had no body' }, { status: HTTP_INTERNAL_ERROR });
  }
  const headers = new Headers();
  headers.set('Content-Type', 'text/event-stream');
  headers.set('Cache-Control', 'no-cache, no-transform');
  return new Response(upstream.body, { status: upstream.status, headers });
}
