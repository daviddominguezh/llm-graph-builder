import { redirect } from 'next/navigation';

import type { Graph } from '@daviddh/graph-types';
import { GraphSchema } from '@daviddh/graph-types';

import { DebugView } from '@/app/components/dashboard/DebugView';
import { getAgentsByOrg } from '@/app/lib/agents';
import { fetchFromBackend } from '@/app/lib/backendProxy';
import { getExecutionsForSession, getNodeVisitsForExecution, getSessionDetail } from '@/app/lib/dashboard';
import { getOrgBySlug } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';

interface SessionDebugPageProps {
  params: Promise<{ slug: string; agentSlug: string; sessionId: string }>;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function resolveAgent(supabase: SupabaseClient, orgId: string, agentSlug: string) {
  const { agents } = await getAgentsByOrg(supabase, orgId);
  return agents.find((a) => a.slug === agentSlug) ?? null;
}

const FIRST_INDEX = 0;

async function fetchInitialNodeVisits(supabase: SupabaseClient, executionId: string | undefined) {
  if (executionId === undefined) return [];
  const { rows } = await getNodeVisitsForExecution(supabase, executionId);
  return rows;
}

export default async function SessionDebugPage({ params }: SessionDebugPageProps): Promise<React.JSX.Element> {
  const { slug, agentSlug, sessionId } = await params;
  const supabase = await createClient();
  const { result: org } = await getOrgBySlug(supabase, slug);

  if (!org) redirect('/');

  const agent = await resolveAgent(supabase, org.id, agentSlug);

  if (!agent) redirect(`/orgs/${slug}/dashboard`);

  const [sessionResult, executionsResult] = await Promise.all([
    getSessionDetail(supabase, sessionId),
    getExecutionsForSession(supabase, sessionId),
  ]);

  if (!sessionResult.session) redirect(`/orgs/${slug}/dashboard/${agentSlug}`);

  const session = sessionResult.session;
  const executions = executionsResult.rows;
  const firstExecution = executions[FIRST_INDEX];

  const [graphRaw, initialNodeVisits] = await Promise.all([
    fetchFromBackend('GET', `/agents/${agent.id}/versions/${String(session.version)}`),
    fetchInitialNodeVisits(supabase, firstExecution?.id),
  ]);
  const graph: Graph = GraphSchema.parse(graphRaw);

  return (
    <DebugView
      session={session}
      executions={executions}
      initialNodeVisits={initialNodeVisits}
      graph={graph}
      orgSlug={slug}
      agentName={agent.name}
      agentSlug={agentSlug}
    />
  );
}
