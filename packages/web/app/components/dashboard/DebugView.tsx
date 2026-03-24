'use client';

import { fetchNodeVisitsForExecution } from '@/app/actions/dashboard';
import type { ExecutionSummaryRow, NodeVisitRow, SessionRow } from '@/app/lib/dashboard';
import type { Graph } from '@/app/schemas/graph.schema';
import { buildDebugGraph } from '@/app/utils/debugGraphBuilder';
import { Separator } from '@/components/ui/separator';
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
  agentSlug: string;
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

export function DebugView({
  session,
  executions,
  initialNodeVisits,
  graph,
  orgSlug,
  agentName,
  agentSlug,
}: DebugViewProps) {
  const t = useTranslations('dashboard');
  const state = useExecutionState(executions, initialNodeVisits);
  const visitedNodeIds = useMemo(() => deriveVisitedNodeIds(state.nodeVisits), [state.nodeVisits]);
  const errorNodeIds = useMemo(() => deriveErrorNodeIds(state.nodeVisits), [state.nodeVisits]);

  const mutedNodeIds = useMemo(
    () => buildDebugGraph(graph.nodes, graph.edges, visitedNodeIds, errorNodeIds).mutedNodeIds,
    [graph, visitedNodeIds, errorNodeIds]
  );

  return (
    <div className="flex h-full flex-col bg-muted">
      <div className="px-6 py-4 shrink-0 bg-muted">
        <DebugBreadcrumb
          slug={orgSlug}
          agentName={agentName}
          agentSlug={agentSlug}
          sessionId={session.session_id}
          dashboardLabel={t('title')}
        />
      </div>

      <Separator />

      <div className="px-6 py-4 flex flex-col gap-4 flex-1 min-h-[0px]">
        <SessionMetadataBar session={session} agentName={agentName} />

        <div className="flex flex-1 gap-4 min-h-0">
          <div className="w-2/3">
            <DebugCanvas
              graph={graph}
              visitedNodeIds={visitedNodeIds}
              errorNodeIds={errorNodeIds}
              selectedNodeId={state.selectedNodeId}
              onNodeClick={state.setSelectedNodeId}
              onDeselectNode={state.handleDeselectNode}
            />
          </div>
          <div className="w-1/3 overflow-y-auto rounded-md border p-4 bg-card">
            <NodeInspector
              nodeId={state.selectedNodeId}
              nodeVisits={state.nodeVisits}
              mutedNodeIds={mutedNodeIds}
              graphNodes={graph.nodes}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
