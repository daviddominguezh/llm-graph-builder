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

export type ContextPrecondition =
  | 'USER_HAS_NAME'
  | 'NO_USER_HAS_NAME'
  | 'USER_HAS_NONEMPTY_CART'
  | 'USER_HAS_EMPTY_CART'
  | 'ASK_GENDER'
  | 'NEVER_ASK_GENDER'
  | 'NO_ASK_GENDER'
  | 'ASK_OCCASION'
  | 'NO_ASK_OCCASION'
  | 'NEVER_ASK_OCCASION'
  | 'ALWAYS_TRUE';

export interface Edge {
  from: string;
  to: string;
  label?: string;
  preconditions?: Precondition[];
  contextPreconditions?: { preconditions: ContextPrecondition[]; jumpTo?: string };
}

export interface Graph {
  startNode: string;
  agents: Array<{ id: string }>;
  nodes: Node[];
  edges: Edge[];
  initialUserMessage?: string;
}
