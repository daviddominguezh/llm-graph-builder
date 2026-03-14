import { browseLibrary } from '@/app/lib/mcp-library';
import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';

const HTTP_UNAUTHORIZED = 401;

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: HTTP_UNAUTHORIZED });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') ?? undefined;
  const category = searchParams.get('category') ?? undefined;
  const limit = Number(searchParams.get('limit') ?? '15');
  const offset = Number(searchParams.get('offset') ?? '0');

  const res = await browseLibrary(supabase, { query, category, limit, offset });
  return NextResponse.json(res);
}
