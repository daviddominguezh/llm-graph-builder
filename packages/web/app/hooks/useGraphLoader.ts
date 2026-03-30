'use client';

import type { AgentConfigResponse } from '@/app/lib/graphApi';
import { fetchGraphOrAgentConfig } from '@/app/lib/graphApi';
import type { Agent, Graph, McpServerConfig, OutputSchemaEntity } from '@/app/schemas/graph.schema';
import { buildInitialEdges, buildInitialNodes } from '@/app/utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '@/app/utils/graphTransformers';
import type { Edge, Node } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface AgentConfigData {
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
}

export interface GraphLoadResult {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  agents: Agent[];
  mcpServers: McpServerConfig[];
  outputSchemas: OutputSchemaEntity[];
  graphData: Graph | undefined;
  agentConfig?: AgentConfigData;
}

export interface UseGraphLoaderReturn {
  loading: boolean;
  result: GraphLoadResult;
  reload: () => void;
}

const NEW_AGENT_RESULT: GraphLoadResult = {
  nodes: buildInitialNodes(undefined),
  edges: buildInitialEdges(undefined),
  agents: [],
  mcpServers: [],
  outputSchemas: [],
  graphData: undefined,
  agentConfig: undefined,
};

const LOADING_RESULT: GraphLoadResult = {
  nodes: [],
  edges: [],
  agents: [],
  mcpServers: [],
  outputSchemas: [],
  graphData: undefined,
  agentConfig: undefined,
};

function buildWorkflowLoadResult(graph: Graph): GraphLoadResult {
  return {
    nodes: buildInitialNodes(graph),
    edges: buildInitialEdges(graph),
    agents: graph.agents,
    mcpServers: graph.mcpServers ?? [],
    outputSchemas: graph.outputSchemas ?? [],
    graphData: graph,
    agentConfig: undefined,
  };
}

function buildAgentLoadResult(config: AgentConfigResponse): GraphLoadResult {
  return {
    nodes: [],
    edges: [],
    agents: [],
    mcpServers: config.mcpServers,
    outputSchemas: [],
    graphData: undefined,
    agentConfig: {
      systemPrompt: config.systemPrompt,
      maxSteps: config.maxSteps,
      contextItems: config.contextItems,
    },
  };
}

function isAgentConfig(response: Graph | AgentConfigResponse): response is AgentConfigResponse {
  return 'appType' in response;
}

function buildLoadResult(response: Graph | AgentConfigResponse): GraphLoadResult {
  if (isAgentConfig(response)) {
    return buildAgentLoadResult(response);
  }
  return buildWorkflowLoadResult(response);
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

    fetchGraphOrAgentConfig(agentId)
      .then((response) => {
        if (!cancelled) onSuccess(buildLoadResult(response));
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
    result: agentId !== undefined ? LOADING_RESULT : NEW_AGENT_RESULT,
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

    void fetchGraphOrAgentConfig(agentId)
      .then((response) => {
        if (mySeq !== reloadSeqRef.current) return;
        setState({ loading: false, result: buildLoadResult(response) });
      })
      .catch(() => {
        if (mySeq !== reloadSeqRef.current) return;
        setState((prev) => ({ ...prev, loading: false }));
        toast.error(t('loadGraphFailed'));
      });
  }, [agentId, t]);

  return { loading: state.loading, result: state.result, reload };
}
