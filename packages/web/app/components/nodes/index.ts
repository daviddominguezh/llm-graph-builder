import type { NodeTypes } from '@xyflow/react';

import { AgentNode } from './Node';
import { PrevExecNode } from './PrevExecNode';
import { StartNode } from './StartNode';

export const nodeTypes: NodeTypes = {
  agent: AgentNode,
  agent_decision: AgentNode,
  start: StartNode,
  prev_exec: PrevExecNode,
};

export { AgentNode, PrevExecNode, StartNode };
