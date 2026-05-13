import { authorizeFormAccess } from '@/app/lib/forms/authorizeFormAccess';
import { createClient } from '@/app/lib/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ agentId: string; formSlug: string }>;
}

export async function GET(req: NextRequest, ctx: RouteParams): Promise<NextResponse> {
  const params = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const tenantId = sp.get('tenantId');
  const from = sp.get('from');
  const to = sp.get('to');
  if (tenantId === null || from === null || to === null) {
    return NextResponse.json({ error: 'missing-params' }, { status: 400 });
  }

  const auth = await authorizeFormAccess({
    agentId: params.agentId,
    formSlug: params.formSlug,
    tenantId,
  });
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const counts = await fetchCounts({
    agentId: params.agentId,
    tenantId,
    formId: auth.formId,
    from,
    to,
  });
  return NextResponse.json(counts);
}

interface CountArgs {
  agentId: string;
  tenantId: string;
  formId: string;
  from: string;
  to: string;
}

interface CountResponse {
  conversationsInRange: number;
  conversationsWithData: number;
}

async function fetchCounts(args: CountArgs): Promise<CountResponse> {
  const db = await createClient();
  const inRange = await db
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', args.tenantId)
    .eq('agent_id', args.agentId)
    .gte('created_at', args.from)
    .lt('created_at', args.to);
  const withData = await db
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', args.tenantId)
    .eq('agent_id', args.agentId)
    .gte('created_at', args.from)
    .lt('created_at', args.to)
    .not(`metadata->forms->${args.formId}`, 'is', null);
  return {
    conversationsInRange: inRange.count ?? 0,
    conversationsWithData: withData.count ?? 0,
  };
}
