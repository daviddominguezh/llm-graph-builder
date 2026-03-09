import type { Edge, Node } from '@xyflow/react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import type { Agent, McpServerConfig } from '../schemas/graph.schema';
import { serializeGraphData } from '../utils/graphSerializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';

const JSON_INDENT = 2;

interface UseExportGraphParams {
  nodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  agents: Agent[];
  mcpServers: McpServerConfig[];
}

export function useExportGraph({ nodes, edges, agents, mcpServers }: UseExportGraphParams): () => void {
  return useCallback(() => {
    const graph = serializeGraphData({ nodes, edges, agents, mcpServers });

    if (graph === null) {
      toast.error('Graph has validation errors. Please fix before exporting.');
      return;
    }

    const json = JSON.stringify(graph, null, JSON_INDENT);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graph.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, agents, mcpServers]);
}
