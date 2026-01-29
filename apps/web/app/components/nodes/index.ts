import type { NodeTypes } from "@xyflow/react";
import { AgentNode } from "./AgentNode";
import { AgentDecisionNode } from "./AgentDecisionNode";

export const nodeTypes: NodeTypes = {
  agent: AgentNode,
  agent_decision: AgentDecisionNode,
};

export { AgentNode, AgentDecisionNode };
