import { updateSession } from '@/app/lib/supabase/middleware';
import type { NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
