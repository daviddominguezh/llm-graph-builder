import { redirect } from 'next/navigation';

import type { Graph } from '@daviddh/graph-types';
import { GraphSchema } from '@daviddh/graph-types';

import { DebugView } from '@/app/components/dashboard/DebugView';
import { getAgentsByOrg } from '@/app/lib/agents';
import { fetchFromBackend } from '@/app/lib/backendProxy';
import { getExecutionsForSession, getNodeVisitsForExecution, getSessionDetail } from '@/app/lib/dashboard';
import { getOrgBySlug } from '@/app/lib/orgs';

interface SessionDebugPageProps {
  params: Promise<{ slug: string; tenantId: string; sessionId: string }>;
}

async function resolveAgentById(orgId: string, agentId: string) {
  const { agents } = await getAgentsByOrg(orgId);
  return agents.find((a) => a.id === agentId) ?? null;
}

const FIRST_INDEX = 0;

async function fetchInitialNodeVisits(executionId: string | undefined) {
  if (executionId === undefined) return [];
  const { rows } = await getNodeVisitsForExecution(executionId);
  return rows;
}

export default async function SessionDebugPage({ params }: SessionDebugPageProps): Promise<React.JSX.Element> {
  const { slug, tenantId: rawTenantId, sessionId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);
  const { result: org } = await getOrgBySlug(slug);

  if (!org) redirect('/');

  const [sessionResult, executionsResult] = await Promise.all([
    getSessionDetail(sessionId),
    getExecutionsForSession(sessionId),
  ]);

  if (!sessionResult.session) redirect(`/orgs/${slug}/dashboard/${encodeURIComponent(tenantId)}`);

  const session = sessionResult.session;
  const agent = await resolveAgentById(org.id, session.agent_id);

  if (!agent) redirect(`/orgs/${slug}/dashboard/${encodeURIComponent(tenantId)}`);

  const executions = executionsResult.rows;
  const firstExecution = executions[FIRST_INDEX];

  const [graphRaw, initialNodeVisits] = await Promise.all([
    fetchFromBackend('GET', `/agents/${agent.id}/versions/${String(session.version)}`),
    fetchInitialNodeVisits(firstExecution?.id),
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
      breadcrumbLabel={tenantId}
      breadcrumbSlug={encodeURIComponent(tenantId)}
    />
  );
}
