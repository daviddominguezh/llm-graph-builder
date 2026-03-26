import type { ContextPreconditions, Edge, Node, Precondition } from '@daviddh/graph-types';

/* ------------------------------------------------------------------ */
/*  Node input types                                                   */
/* ------------------------------------------------------------------ */

export interface AddNodeInput {
  id: string;
  text: string;
  kind: 'agent' | 'agent_decision';
  description?: string;
  agent?: string;
  nextNodeIsUser?: boolean;
  fallbackNodeId?: string;
  global?: boolean;
  outputSchemaId?: string;
  outputPrompt?: string;
}

export interface UpdateNodeFields {
  text?: string;
  kind?: 'agent' | 'agent_decision';
  description?: string;
  agent?: string;
  nextNodeIsUser?: boolean;
  fallbackNodeId?: string;
  global?: boolean;
  outputSchemaId?: string;
  outputPrompt?: string;
}

export interface MergedNodeData {
  nodeId: string;
  text: string;
  kind: 'agent' | 'agent_decision';
  description?: string;
  agent?: string;
  nextNodeIsUser?: boolean;
  fallbackNodeId?: string;
  global?: boolean;
  outputSchemaId?: string;
  outputPrompt?: string;
}

/* ------------------------------------------------------------------ */
/*  Edge input types                                                   */
/* ------------------------------------------------------------------ */

export interface AddEdgeInput {
  from: string;
  to: string;
  preconditions?: Precondition[];
  contextPreconditions?: ContextPreconditions;
}

export interface UpdateEdgeInput {
  from: string;
  to: string;
  fields: { preconditions?: Precondition[]; contextPreconditions?: ContextPreconditions };
}

/* ------------------------------------------------------------------ */
/*  Result types                                                       */
/* ------------------------------------------------------------------ */

export interface DeleteNodeResult {
  deletedNode: Node;
  affectedEdges: Edge[];
}

export interface BatchMutateResult {
  applied: number;
}
