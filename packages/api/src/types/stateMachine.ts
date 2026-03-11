import type { OutputSchemaField } from '@daviddh/graph-types';
import type { ToolChoice, ToolSet } from 'ai';

import type { Edge, Node } from './graph.js';

export interface EdgeTools {
  tools?: ToolSet;
  toolChoice?: ToolChoice<NoInfer<ToolSet>>;
}

export type ToolsByEdge = Record<string, EdgeTools>;

export type NodeKind = 'tool_call' | 'agent_decision' | 'user_reply' | 'structured_output';

export interface SMNextOptions {
  edges: Edge[];
  node: Node;
  prompt: string;
  promptWithoutToolPreconditions: string;
  toolsByEdge: ToolsByEdge;
  nextNode?: string;
  kind: NodeKind;
  nodes: Record<string, string>;
  outputSchema?: OutputSchemaField[];
}

export interface SMConfig {
  prompt: string;
  promptWithoutToolPreconditions: string;
  toolsByEdge: ToolsByEdge;
  node: Node;
  nextNode?: string;
  kind: NodeKind;
  nodes: Record<string, string>;
  outputSchema?: OutputSchemaField[];
}

export interface UserNode {
  currentNode: string;
}
