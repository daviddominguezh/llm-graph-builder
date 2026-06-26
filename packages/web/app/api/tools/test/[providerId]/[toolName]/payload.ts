// Build a minimal-but-complete ExecutePayload for tool testing.
//
// The edge function's execute-tool runner consumes the same payload shape that
// execute-agent does; for the tool-test path we only need the fields the
// bundle preparers + provider registry actually read. The LLM-loop-specific
// fields (messages, apiKey, modelId, systemPrompt) are stubbed because no
// loop runs.
import type { SelectedTool } from '@daviddh/llm-graph-runner';

interface BuildPayloadArgs {
  agentId: string;
  orgId: string;
  tenantId: string;
  providerId: string;
  toolName: string;
  selectedKvStoreId: string | null;
  selectedRagStoreId: string | null;
  args: unknown;
}

/**
 * The runtime graph the registry needs to enumerate providers. Builtin
 * providers don't read graph contents; MCP providers read mcpServers (none
 * here because the FE Play button tests a single builtin tool by id).
 */
function emptyRuntimeGraph(): Record<string, unknown> {
  return {
    startNode: '',
    agents: [],
    nodes: [],
    edges: [],
    mcpServers: [],
  };
}

/**
 * Builds the body sent to the edge function's /execute-tool endpoint. The
 * selectedTools list contains exactly one entry — the tool under test —
 * because buildAgentToolsAtStart only emits tools that appear in the list.
 */
export function buildExecuteToolBody(args: BuildPayloadArgs): Record<string, unknown> {
  const selectedTool: SelectedTool = {
    providerType: 'builtin',
    providerId: args.providerId,
    toolName: args.toolName,
  };
  return {
    payload: {
      graph: emptyRuntimeGraph(),
      apiKey: '',
      modelId: '',
      currentNodeId: '',
      messages: [],
      structuredOutputs: {},
      data: {},
      quickReplies: {},
      sessionID: args.agentId,
      orgID: args.orgId,
      tenantID: args.tenantId,
      userID: '',
      isFirstMessage: false,
      schemaVersion: 2,
      selectedTools: [selectedTool],
      selectedKvStoreId: args.selectedKvStoreId,
      selectedRagStoreId: args.selectedRagStoreId,
    },
    providerId: args.providerId,
    toolName: args.toolName,
    args: args.args,
  };
}
