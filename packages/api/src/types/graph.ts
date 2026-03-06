export type NodeKind =
  | 'agent'
  | 'tool'
  | 'success'
  | 'error'
  | 'decision'
  | 'info'
  | 'warning'
  | 'normal'
  | 'user_decision'
  | 'agent_decision';

export interface Precondition {
  type: 'tool_call' | 'user_said' | 'agent_decision';
  value: string;
  description?: string;
}

export interface Node {
  id: string;
  text: string;
  kind: NodeKind;
  agent?: string;
  isUser?: boolean;
  description?: string;
  nextNodeIsUser?: boolean;
  previousNodeWasUser?: boolean;
}

export interface Edge {
  from: string;
  to: string;
  label?: string;
  preconditions?: Precondition[];
  contextPreconditions?: { preconditions: string[]; jumpTo?: string };
}

export interface Graph {
  startNode: string;
  agents: Array<{ id: string }>;
  nodes: Node[];
  edges: Edge[];
  initialUserMessage?: string;
}
