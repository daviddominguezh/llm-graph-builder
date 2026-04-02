import { redirect } from 'next/navigation';

import type { Graph } from '@daviddh/graph-types';
import { GraphSchema } from '@daviddh/graph-types';

import { AgentDebugView } from '@/app/components/dashboard/AgentDebugView';
import { DebugView } from '@/app/components/dashboard/DebugView';
import type { AgentMetadata } from '@/app/lib/agents';
import { getAgentsByOrg } from '@/app/lib/agents';
import { fetchFromBackend } from '@/app/lib/backendProxy';
import {
  type ExecutionSummaryRow,
  getExecutionsForSession,
  getMessagesForExecution,
  getNodeVisitsForExecution,
  getSessionDetail,
} from '@/app/lib/dashboard';
import { getOrgBySlug } from '@/app/lib/orgs';

interface SessionDebugPageProps {
  params: Promise<{ slug: string; tenantId: string; sessionId: string }>;
  searchParams: Promise<{ execution?: string }>;
}

async function resolveAgentById(orgId: string, agentId: string) {
  const { agents } = await getAgentsByOrg(orgId);
  return agents.find((a) => a.id === agentId) ?? null;
}

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

function pickExecution(executions: ExecutionSummaryRow[], targetId: string | undefined): ExecutionSummaryRow | undefined {
  if (targetId !== undefined) {
    const match = executions.find((e) => e.id === targetId);
    if (match !== undefined) return match;
  }
  return executions[executions.length - 1];
}

interface SessionData {
  slug: string;
  tenantSlug: string;
  session: NonNullable<Awaited<ReturnType<typeof getSessionDetail>>['session']>;
  agent: AgentMetadata;
  executions: ExecutionSummaryRow[];
  selectedExecution: ExecutionSummaryRow | undefined;
}

async function loadSessionData(
  slug: string,
  rawTenantSlug: string,
  sessionId: string,
  executionId: string | undefined
): Promise<SessionData | null> {
  const tenantSlug = decodeURIComponent(rawTenantSlug);
  const { result: org } = await getOrgBySlug(slug);

  if (!org) return null;

  const [sessionResult, executionsResult] = await Promise.all([
    getSessionDetail(sessionId),
    getExecutionsForSession(sessionId),
  ]);

  if (!sessionResult.session) return null;

  const agent = await resolveAgentById(org.id, sessionResult.session.agent_id);
  if (!agent) return null;

  const selectedExecution = pickExecution(executionsResult.rows, executionId);

  return { slug, tenantSlug, session: sessionResult.session, agent, executions: executionsResult.rows, selectedExecution };
}

async function renderAgentDebug(data: SessionData) {
  const [initialNodeVisits, initialMessages] = await Promise.all([
    fetchInitialNodeVisits(data.selectedExecution?.id),
    fetchInitialMessages(data.selectedExecution?.id),
  ]);

  return (
    <AgentDebugView
      session={data.session}
      executions={data.executions}
      initialNodeVisits={initialNodeVisits}
      initialMessages={initialMessages}
      initialExecutionId={data.selectedExecution?.id}
      orgSlug={data.slug}
      agentName={data.agent.name}
      breadcrumbLabel={data.tenantSlug}
      breadcrumbSlug={encodeURIComponent(data.tenantSlug)}
    />
  );
}

async function renderWorkflowDebug(data: SessionData) {
  const [graphRaw, initialNodeVisits] = await Promise.all([
    fetchFromBackend('GET', `/agents/${data.agent.id}/versions/${String(data.session.version)}`),
    fetchInitialNodeVisits(data.selectedExecution?.id),
  ]);
  const graph: Graph = GraphSchema.parse(graphRaw);

  return (
    <DebugView
      session={data.session}
      executions={data.executions}
      initialNodeVisits={initialNodeVisits}
      initialExecutionId={data.selectedExecution?.id}
      graph={graph}
      orgSlug={data.slug}
      agentName={data.agent.name}
      breadcrumbLabel={data.tenantSlug}
      breadcrumbSlug={encodeURIComponent(data.tenantSlug)}
    />
  );
}

export default async function SessionDebugPage({ params, searchParams }: SessionDebugPageProps): Promise<React.JSX.Element> {
  const { slug, tenantId: rawTenantSlug, sessionId } = await params;
  const { execution: executionId } = await searchParams;
  const tenantSlug = decodeURIComponent(rawTenantSlug);

  const data = await loadSessionData(slug, rawTenantSlug, sessionId, executionId);

  if (!data) redirect(`/orgs/${slug}/dashboard/${encodeURIComponent(tenantSlug)}`);

  const isAgentApp = resolveAppType(data.agent) === 'agent';

  if (isAgentApp) return renderAgentDebug(data);
  return renderWorkflowDebug(data);
}
