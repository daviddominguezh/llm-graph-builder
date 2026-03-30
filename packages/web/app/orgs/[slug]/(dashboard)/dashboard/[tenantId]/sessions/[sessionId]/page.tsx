import { redirect } from 'next/navigation';

import type { Graph } from '@daviddh/graph-types';
import { GraphSchema } from '@daviddh/graph-types';

import { AgentDebugView } from '@/app/components/dashboard/AgentDebugView';
import { DebugView } from '@/app/components/dashboard/DebugView';
import type { AgentMetadata } from '@/app/lib/agents';
import { getAgentsByOrg } from '@/app/lib/agents';
import { fetchFromBackend } from '@/app/lib/backendProxy';
import {
  getExecutionsForSession,
  getMessagesForExecution,
  getNodeVisitsForExecution,
  getSessionDetail,
} from '@/app/lib/dashboard';
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

async function fetchInitialMessages(executionId: string | undefined) {
  if (executionId === undefined) return [];
  const { rows } = await getMessagesForExecution(executionId);
  return rows;
}

function resolveAppType(agent: AgentMetadata): string {
  const rec = agent as Record<string, unknown>;
  return typeof rec['app_type'] === 'string' ? (rec['app_type'] as string) : 'workflow';
}

interface SessionData {
  slug: string;
  tenantId: string;
  session: NonNullable<Awaited<ReturnType<typeof getSessionDetail>>['session']>;
  agent: AgentMetadata;
  executions: Awaited<ReturnType<typeof getExecutionsForSession>>['rows'];
}

async function loadSessionData(slug: string, rawTenantId: string, sessionId: string): Promise<SessionData | null> {
  const tenantId = decodeURIComponent(rawTenantId);
  const { result: org } = await getOrgBySlug(slug);

  if (!org) return null;

  const [sessionResult, executionsResult] = await Promise.all([
    getSessionDetail(sessionId),
    getExecutionsForSession(sessionId),
  ]);

  if (!sessionResult.session) return null;

  const agent = await resolveAgentById(org.id, sessionResult.session.agent_id);
  if (!agent) return null;

  return { slug, tenantId, session: sessionResult.session, agent, executions: executionsResult.rows };
}

async function renderAgentDebug(data: SessionData) {
  const firstExecution = data.executions[FIRST_INDEX];

  const [initialNodeVisits, initialMessages] = await Promise.all([
    fetchInitialNodeVisits(firstExecution?.id),
    fetchInitialMessages(firstExecution?.id),
  ]);

  return (
    <AgentDebugView
      session={data.session}
      executions={data.executions}
      initialNodeVisits={initialNodeVisits}
      initialMessages={initialMessages}
      orgSlug={data.slug}
      agentName={data.agent.name}
      breadcrumbLabel={data.tenantId}
      breadcrumbSlug={encodeURIComponent(data.tenantId)}
    />
  );
}

async function renderWorkflowDebug(data: SessionData) {
  const firstExecution = data.executions[FIRST_INDEX];

  const [graphRaw, initialNodeVisits] = await Promise.all([
    fetchFromBackend('GET', `/agents/${data.agent.id}/versions/${String(data.session.version)}`),
    fetchInitialNodeVisits(firstExecution?.id),
  ]);
  const graph: Graph = GraphSchema.parse(graphRaw);

  return (
    <DebugView
      session={data.session}
      executions={data.executions}
      initialNodeVisits={initialNodeVisits}
      graph={graph}
      orgSlug={data.slug}
      agentName={data.agent.name}
      breadcrumbLabel={data.tenantId}
      breadcrumbSlug={encodeURIComponent(data.tenantId)}
    />
  );
}

export default async function SessionDebugPage({ params }: SessionDebugPageProps): Promise<React.JSX.Element> {
  const { slug, tenantId: rawTenantId, sessionId } = await params;
  const tenantId = decodeURIComponent(rawTenantId);

  const data = await loadSessionData(slug, rawTenantId, sessionId);

  if (!data) redirect(`/orgs/${slug}/dashboard/${encodeURIComponent(tenantId)}`);

  const isAgentApp = resolveAppType(data.agent) === 'agent';

  if (isAgentApp) return renderAgentDebug(data);
  return renderWorkflowDebug(data);
}
