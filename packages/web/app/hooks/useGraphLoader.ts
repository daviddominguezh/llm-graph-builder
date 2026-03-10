'use client';

import { fetchGraph } from '@/app/lib/graphApi';
import type { Agent, Graph, McpServerConfig } from '@/app/schemas/graph.schema';
import { buildInitialEdges, buildInitialNodes } from '@/app/utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '@/app/utils/graphTransformers';
import type { Edge, Node } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface GraphLoadResult {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  agents: Agent[];
  mcpServers: McpServerConfig[];
  graphData: Graph | undefined;
}

export interface UseGraphLoaderReturn {
  loading: boolean;
  result: GraphLoadResult;
  reload: () => void;
}

const EMPTY_RESULT: GraphLoadResult = {
  nodes: buildInitialNodes(undefined),
  edges: buildInitialEdges(undefined),
  agents: [],
  mcpServers: [],
  graphData: undefined,
};

function buildLoadResult(graph: Graph): GraphLoadResult {
  return {
    nodes: buildInitialNodes(graph),
    edges: buildInitialEdges(graph),
    agents: graph.agents,
    mcpServers: graph.mcpServers ?? [],
    graphData: graph,
  };
}

interface LoaderState {
  loading: boolean;
  result: GraphLoadResult;
}

function useLoadOnMount(
  agentId: string | undefined,
  onSuccess: (r: GraphLoadResult) => void,
  onError: () => void
): void {
  useEffect(() => {
    if (agentId === undefined) return;

    let cancelled = false;

    fetchGraph(agentId)
      .then((graph) => {
        if (!cancelled) onSuccess(buildLoadResult(graph));
      })
      .catch(() => {
        if (!cancelled) onError();
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, onSuccess, onError]);
}

export function useGraphLoader(agentId: string | undefined): UseGraphLoaderReturn {
  const t = useTranslations('editor');
  const [state, setState] = useState<LoaderState>({
    loading: agentId !== undefined,
    result: EMPTY_RESULT,
  });

  const handleSuccess = useCallback((loadResult: GraphLoadResult) => {
    setState({ loading: false, result: loadResult });
  }, []);

  const handleError = useCallback(() => {
    setState((prev) => ({ ...prev, loading: false }));
    toast.error(t('loadGraphFailed'));
  }, [t]);

  useLoadOnMount(agentId, handleSuccess, handleError);

  const reloadSeqRef = useRef(0);

  const reload = useCallback(() => {
    if (agentId === undefined) return;
    const mySeq = ++reloadSeqRef.current;
    setState((prev) => ({ ...prev, loading: true }));

    void fetchGraph(agentId)
      .then((graph) => {
        if (mySeq !== reloadSeqRef.current) return;
        setState({ loading: false, result: buildLoadResult(graph) });
      })
      .catch(() => {
        if (mySeq !== reloadSeqRef.current) return;
        setState((prev) => ({ ...prev, loading: false }));
        toast.error(t('loadGraphFailed'));
      });
  }, [agentId, t]);

  return { loading: state.loading, result: state.result, reload };
}
