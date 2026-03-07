import type { ToolChoice, ToolSet } from 'ai';

import type { Edge, Node } from './graph.js';

export interface EdgeTools {
  tools?: ToolSet;
  toolChoice?: ToolChoice<NoInfer<ToolSet>>;
}

export type ToolsByEdge = Record<string, EdgeTools>;

export interface SMNextOptions {
  edges: Edge[];
  node: Node;
  prompt: string;
  promptWithoutToolPreconditions: string;
  toolsByEdge: ToolsByEdge;
  nextNode?: string;
  kind: 'tool_call' | 'agent_decision' | 'user_reply';
  nodes: Record<string, string>;
}

export interface SMConfig {
  prompt: string;
  promptWithoutToolPreconditions: string;
  toolsByEdge: ToolsByEdge;
  node: Node;
  nextNode?: string;
  kind: 'tool_call' | 'agent_decision' | 'user_reply';
  nodes: Record<string, string>;
}

export interface UserNode {
  currentNode: string;
}
