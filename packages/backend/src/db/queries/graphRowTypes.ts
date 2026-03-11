import type { BaseNodeKind, PreconditionType } from '@daviddh/graph-types';

/** Row shape returned by `graph_nodes` table. */
export interface NodeRow {
  agent_id: string;
  node_id: string;
  text: string;
  kind: BaseNodeKind;
  description: string;
  agent: string | null;
  next_node_is_user: boolean | null;
  fallback_node_id: string | null;
  global: boolean;
  default_fallback: boolean | null;
  position_x: number | null;
  position_y: number | null;
  output_schema: Record<string, unknown>[] | null;
}

/** Row shape returned by `graph_edges` table. */
export interface EdgeRow {
  id: string;
  agent_id: string;
  from_node: string;
  to_node: string;
}

/** Row shape returned by `graph_edge_preconditions` table. */
export interface EdgePreconditionRow {
  edge_id: string;
  type: PreconditionType;
  value: string;
  description: string | null;
  tool_fields: Record<string, unknown> | null;
}

/** Row shape returned by `graph_edge_context_preconditions` table. */
export interface EdgeContextPreconditionRow {
  edge_id: string;
  preconditions: string[];
  jump_to: string | null;
}

/** Row shape returned by `graph_agents` table. */
export interface AgentRow {
  agent_id: string;
  agent_key: string;
  description: string;
}

export type McpTransportType = 'stdio' | 'sse' | 'http';

/** Row shape returned by `graph_mcp_servers` table. */
export interface McpServerRow {
  agent_id: string;
  server_id: string;
  name: string;
  transport_type: McpTransportType;
  transport_config: Record<string, unknown>;
  enabled: boolean;
}

/** Partial agent row for start_node lookup. */
export interface AgentStartNodeRow {
  start_node: string | null;
}
