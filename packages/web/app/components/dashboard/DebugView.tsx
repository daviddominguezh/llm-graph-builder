'use client';

import { fetchNodeVisitsForExecution } from '@/app/actions/dashboard';
import type { ExecutionSummaryRow, NodeVisitRow, SessionRow } from '@/app/lib/dashboard';
import type { Graph } from '@/app/schemas/graph.schema';
import { buildDebugGraph } from '@/app/utils/debugGraphBuilder';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState, useTransition } from 'react';

import { DebugCanvas } from './DebugCanvas';
import { NodeInspector } from './NodeInspector';
import { DebugBreadcrumb } from './debug-view/DebugBreadcrumb';
import { SessionMetadataBar } from './debug-view/SessionMetadataBar';

interface DebugViewProps {
  session: SessionRow;
  executions: ExecutionSummaryRow[];
  initialNodeVisits: NodeVisitRow[];
  graph: Graph;
  orgSlug: string;
  agentName: string;
  breadcrumbLabel: string;
  breadcrumbSlug: string;
}

const FIRST_INDEX = 0;

function deriveVisitedNodeIds(visits: NodeVisitRow[]): string[] {
  return visits.map((v) => v.node_id);
}

function hasErrorResponse(response: unknown): boolean {
  if (typeof response !== 'object' || response === null) return false;
  const rec = response as Record<string, unknown>;
  return typeof rec['error'] === 'string' && rec['error'] !== '';
}

function deriveErrorNodeIds(visits: NodeVisitRow[]): Set<string> {
  const ids = new Set<string>();
  for (const v of visits) {
    if (hasErrorResponse(v.response)) {
      ids.add(v.node_id);
    }
  }
  return ids;
}

function findExecution(
  executions: ExecutionSummaryRow[],
  selectedId: string
): ExecutionSummaryRow | undefined {
  return executions.find((e) => e.id === selectedId);
}

function ExecutionErrorBanner({
  execution,
  label,
}: {
  execution: ExecutionSummaryRow;
  label: string;
}) {
  if (execution.status !== 'failed' || execution.error === null || execution.error === '') {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription>{execution.error}</AlertDescription>
    </Alert>
  );
}

function useExecutionState(executions: ExecutionSummaryRow[], initialVisits: NodeVisitRow[]) {
  const firstExecution = executions[FIRST_INDEX];
  const [selectedExecutionId, setSelectedExecutionId] = useState(firstExecution?.id ?? '');
  const [nodeVisits, setNodeVisits] = useState<NodeVisitRow[]>(initialVisits);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleSelectExecution = useCallback(
    (executionId: string) => {
      setSelectedExecutionId(executionId);
      setSelectedNodeId(null);

      startTransition(async () => {
        const result = await fetchNodeVisitsForExecution(executionId);
        setNodeVisits(result.rows);
      });
    },
    [startTransition]
  );

  const handleDeselectNode = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  return {
    selectedExecutionId,
    nodeVisits,
    selectedNodeId,
    setSelectedNodeId,
    handleDeselectNode,
    handleSelectExecution,
  };
}

interface DebugHeaderProps {
  orgSlug: string;
  agentName: string;
  agentSlug: string;
  sessionId: string;
  dashboardLabel: string;
}

function DebugHeader({ orgSlug, agentName, agentSlug, sessionId, dashboardLabel }: DebugHeaderProps) {
  return (
    <>
      <div className="px-6 py-4 shrink-0 bg-background">
        <DebugBreadcrumb
          slug={orgSlug}
          agentName={agentName}
          agentSlug={agentSlug}
          sessionId={sessionId}
          dashboardLabel={dashboardLabel}
        />
      </div>
      <Separator />
    </>
  );
}

interface DebugCanvasAreaProps {
  graph: Graph;
  visitedNodeIds: string[];
  errorNodeIds: Set<string>;
  mutedNodeIds: Set<string>;
  selectedNodeId: string | null;
  nodeVisits: NodeVisitRow[];
  onNodeClick: (id: string) => void;
  onDeselectNode: () => void;
}

function DebugCanvasArea({
  graph,
  visitedNodeIds,
  errorNodeIds,
  mutedNodeIds,
  selectedNodeId,
  nodeVisits,
  onNodeClick,
  onDeselectNode,
}: DebugCanvasAreaProps) {
  return (
    <div className="flex flex-1 gap-4 min-h-0">
      <div className="w-2/3">
        <DebugCanvas
          graph={graph}
          visitedNodeIds={visitedNodeIds}
          errorNodeIds={errorNodeIds}
          selectedNodeId={selectedNodeId}
          onNodeClick={onNodeClick}
          onDeselectNode={onDeselectNode}
        />
      </div>
      <div className="w-1/3 overflow-y-auto rounded-md border p-4 bg-card">
        <NodeInspector
          nodeId={selectedNodeId}
          nodeVisits={nodeVisits}
          mutedNodeIds={mutedNodeIds}
          graphNodes={graph.nodes}
        />
      </div>
    </div>
  );
}

interface DebugBodyProps {
  session: SessionRow;
  agentName: string;
  selectedExecution: ExecutionSummaryRow | undefined;
  errorBannerLabel: string;
  canvasAreaProps: DebugCanvasAreaProps;
}

function DebugBody({ session, agentName, selectedExecution, errorBannerLabel, canvasAreaProps }: DebugBodyProps) {
  return (
    <div className="px-6 py-4 flex flex-col gap-4 flex-1 min-h-[0px]">
      <SessionMetadataBar session={session} agentName={agentName} />
      {selectedExecution !== undefined && (
        <ExecutionErrorBanner execution={selectedExecution} label={errorBannerLabel} />
      )}
      <DebugCanvasArea {...canvasAreaProps} />
    </div>
  );
}

function useDebugViewState(props: DebugViewProps) {
  const { executions, initialNodeVisits, graph } = props;
  const state = useExecutionState(executions, initialNodeVisits);
  const visitedNodeIds = useMemo(() => deriveVisitedNodeIds(state.nodeVisits), [state.nodeVisits]);
  const errorNodeIds = useMemo(() => deriveErrorNodeIds(state.nodeVisits), [state.nodeVisits]);
  const mutedNodeIds = useMemo(
    () => buildDebugGraph(graph.nodes, graph.edges, visitedNodeIds, errorNodeIds).mutedNodeIds,
    [graph, visitedNodeIds, errorNodeIds]
  );
  const selectedExecution = useMemo(
    () => findExecution(executions, state.selectedExecutionId),
    [executions, state.selectedExecutionId]
  );

  return { state, visitedNodeIds, errorNodeIds, mutedNodeIds, selectedExecution };
}

export function DebugView(props: DebugViewProps) {
  const { session, graph, orgSlug, agentName, breadcrumbLabel, breadcrumbSlug } = props;
  const t = useTranslations('dashboard');
  const { state, visitedNodeIds, errorNodeIds, mutedNodeIds, selectedExecution } =
    useDebugViewState(props);

  const canvasAreaProps: DebugCanvasAreaProps = {
    graph,
    visitedNodeIds,
    errorNodeIds,
    mutedNodeIds,
    selectedNodeId: state.selectedNodeId,
    nodeVisits: state.nodeVisits,
    onNodeClick: state.setSelectedNodeId,
    onDeselectNode: state.handleDeselectNode,
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <DebugHeader
        orgSlug={orgSlug}
        agentName={breadcrumbLabel}
        agentSlug={breadcrumbSlug}
        sessionId={session.session_id}
        dashboardLabel={t('title')}
      />
      <DebugBody
        session={session}
        agentName={agentName}
        selectedExecution={selectedExecution}
        errorBannerLabel={t('debug.executionError')}
        canvasAreaProps={canvasAreaProps}
      />
    </div>
  );
}
