import type { Operation } from '@daviddh/graph-types';
import type { Node } from '@xyflow/react';

import type { Agent, Graph, McpServerConfig } from '../schemas/graph.schema';
import type { RFNodeData } from './graphTransformers';
import { buildDeleteNodeOp, buildInsertEdgeOp, buildInsertNodeOp } from './operationBuilders';

type NodeArray = Array<Node<RFNodeData>>;

function buildDeleteOps(currentNodes: NodeArray, currentMcpServers: McpServerConfig[]): Operation[] {
  const ops: Operation[] = [];
  for (const node of currentNodes) {
    ops.push(buildDeleteNodeOp(node.data.nodeId));
  }
  for (const server of currentMcpServers) {
    ops.push({ type: 'deleteMcpServer', serverId: server.id });
  }
  return ops;
}

function buildInsertNodeOps(newNodes: NodeArray): Operation[] {
  return newNodes.map((node) => buildInsertNodeOp(node));
}

function buildInsertEdgeOps(graph: Graph): Operation[] {
  return graph.edges.map((e) =>
    buildInsertEdgeOp(e.from, e.to, {
      preconditions: e.preconditions,
      contextPreconditions: e.contextPreconditions,
    })
  );
}

function buildInsertAgentOps(agents: Agent[]): Operation[] {
  return agents.map((a) => ({
    type: 'insertAgent' as const,
    data: { agentKey: a.id, description: a.description },
  }));
}

function buildInsertMcpOps(servers: McpServerConfig[]): Operation[] {
  return servers.map((s) => ({
    type: 'insertMcpServer' as const,
    data: { serverId: s.id, name: s.name, transport: s.transport, enabled: s.enabled },
  }));
}

export interface ImportOperationsInput {
  currentNodes: NodeArray;
  currentMcpServers: McpServerConfig[];
  importedGraph: Graph;
  importedNodes: NodeArray;
}

export function buildImportOperations(input: ImportOperationsInput): Operation[] {
  const { currentNodes, currentMcpServers, importedGraph, importedNodes } = input;

  return [
    ...buildDeleteOps(currentNodes, currentMcpServers),
    ...buildInsertNodeOps(importedNodes),
    ...buildInsertEdgeOps(importedGraph),
    ...buildInsertAgentOps(importedGraph.agents),
    ...buildInsertMcpOps(importedGraph.mcpServers ?? []),
    { type: 'updateStartNode', startNode: importedGraph.startNode },
  ];
}
