'use client';

import { fetchNodeVisitsForExecution } from '@/app/actions/dashboard';
import type { ExecutionSummaryRow, NodeVisitRow, SessionRow } from '@/app/lib/dashboard';
import type { Graph } from '@/app/schemas/graph.schema';
import { type BuildDebugGraphOptions, buildDebugGraph } from '@/app/utils/debugGraphBuilder';
import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState, useTransition } from 'react';

import { Scrollable } from '../Scrollable';
import { DebugCanvas } from './DebugCanvas';
import { NodeInspector } from './NodeInspector';
import { DebugBreadcrumb } from './debug-view/DebugBreadcrumb';
import { ExecutionErrorBanner } from './debug-view/ExecutionErrorBanner';
import { ExecutionSidebar } from './debug-view/ExecutionSidebar';
import { SessionMetadataBar } from './debug-view/SessionMetadataBar';

interface DebugViewProps {
  session: SessionRow;
  executions: ExecutionSummaryRow[];
  initialNodeVisits: NodeVisitRow[];
  initialExecutionId?: string;
  graph: Graph;
  orgSlug: string;
  agentName: string;
  breadcrumbLabel: string;
  breadcrumbSlug: string;
}


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

function useExecutionState(executions: ExecutionSummaryRow[], initialVisits: NodeVisitRow[], initialId?: string) {
  const lastExecution = executions[executions.length - 1];
  const [selectedExecutionId, setSelectedExecutionId] = useState(initialId ?? lastExecution?.id ?? '');
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
      <div className="px-4 py-3 shrink-0 bg-background">
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
  prevExecLabel?: string;
  onGoToPrevExec?: () => void;
  debugGraphOptions?: BuildDebugGraphOptions;
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
  prevExecLabel,
  onGoToPrevExec,
  debugGraphOptions,
}: DebugCanvasAreaProps) {
  return (
    <div className="px-4 pt-4 flex flex-1 gap-4 min-h-0">
      <div className="w-2/3">
        <DebugCanvas
          graph={graph}
          visitedNodeIds={visitedNodeIds}
          errorNodeIds={errorNodeIds}
          selectedNodeId={selectedNodeId}
          onNodeClick={onNodeClick}
          onDeselectNode={onDeselectNode}
          debugGraphOptions={debugGraphOptions}
        />
      </div>
      <Scrollable className="w-1/3">
        <NodeInspector
          nodeId={selectedNodeId}
          nodeVisits={nodeVisits}
          mutedNodeIds={mutedNodeIds}
          graphNodes={graph.nodes}
          prevExecLabel={prevExecLabel}
          onGoToPrevExec={onGoToPrevExec}
        />
      </Scrollable>
    </div>
  );
}

interface DebugBodyProps {
  session: SessionRow;
  agentName: string;
  tenantName: string;
  selectedExecution: ExecutionSummaryRow | undefined;
  errorBannerLabel: string;
  canvasAreaProps: DebugCanvasAreaProps;
}

function DebugBody({
  session,
  agentName,
  tenantName,
  selectedExecution,
  errorBannerLabel,
  canvasAreaProps,
}: DebugBodyProps) {
  return (
    <div className="px-0 pb-3 flex flex-col gap-0 flex-1 min-h-[0px]">
      <SessionMetadataBar session={session} agentName={agentName} tenantName={tenantName} />
      <Separator />
      {selectedExecution !== undefined && (
        <div className="px-4">
          <ExecutionErrorBanner execution={selectedExecution} label={errorBannerLabel} />
        </div>
      )}
      <DebugCanvasArea {...canvasAreaProps} />
    </div>
  );
}

function derivePrevExecOptions(executions: ExecutionSummaryRow[], selectedId: string): BuildDebugGraphOptions {
  const idx = executions.findIndex((e) => e.id === selectedId);
  if (idx <= 0) return {};
  const prev = executions[idx - 1];
  if (prev === undefined) return {};
  return { prevExec: { label: `Execution ${String(idx)}`, executionId: prev.id } };
}

function useDebugViewState(props: DebugViewProps) {
  const { executions, initialNodeVisits, graph } = props;
  const state = useExecutionState(executions, initialNodeVisits, props.initialExecutionId);
  const visitedNodeIds = useMemo(() => deriveVisitedNodeIds(state.nodeVisits), [state.nodeVisits]);
  const errorNodeIds = useMemo(() => deriveErrorNodeIds(state.nodeVisits), [state.nodeVisits]);

  const prevExecOptions = useMemo(
    () => derivePrevExecOptions(executions, state.selectedExecutionId),
    [executions, state.selectedExecutionId]
  );

  const debugGraph = useMemo(
    () => buildDebugGraph(graph.nodes, graph.edges, visitedNodeIds, errorNodeIds, prevExecOptions),
    [graph, visitedNodeIds, errorNodeIds, prevExecOptions]
  );

  const selectedExecution = useMemo(
    () => findExecution(executions, state.selectedExecutionId),
    [executions, state.selectedExecutionId]
  );

  return { state, visitedNodeIds, errorNodeIds, mutedNodeIds: debugGraph.mutedNodeIds, selectedExecution, prevExecOptions };
}

export function DebugView(props: DebugViewProps) {
  const { session, graph, orgSlug, agentName, breadcrumbLabel, breadcrumbSlug } = props;
  const t = useTranslations('dashboard');
  const { state, visitedNodeIds, errorNodeIds, mutedNodeIds, selectedExecution, prevExecOptions } =
    useDebugViewState(props);

  const prevExec = prevExecOptions.prevExec;

  const canvasAreaProps: DebugCanvasAreaProps = {
    graph,
    visitedNodeIds,
    errorNodeIds,
    mutedNodeIds,
    selectedNodeId: state.selectedNodeId,
    nodeVisits: state.nodeVisits,
    onNodeClick: state.setSelectedNodeId,
    onDeselectNode: state.handleDeselectNode,
    prevExecLabel: prevExec?.label,
    onGoToPrevExec: prevExec !== undefined ? () => state.handleSelectExecution(prevExec.executionId) : undefined,
    debugGraphOptions: prevExecOptions,
  };

  return (
    <div className="flex h-[calc(100%-var(--spacing)*2)] flex-col bg-background overflow-hidden border border mr-2 rounded-xl">
      <DebugHeader
        orgSlug={orgSlug}
        agentName={breadcrumbLabel}
        agentSlug={breadcrumbSlug}
        sessionId={session.session_id}
        dashboardLabel={t('title')}
      />
      <div className="flex flex-1 min-h-0">
        <ExecutionSidebar
          executions={props.executions}
          selectedId={state.selectedExecutionId}
          onSelect={state.handleSelectExecution}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          <DebugBody
            session={session}
            agentName={agentName}
            tenantName={breadcrumbLabel}
            selectedExecution={selectedExecution}
            errorBannerLabel={t('debug.executionError')}
            canvasAreaProps={canvasAreaProps}
          />
        </div>
      </div>
    </div>
  );
}
